import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { app, authed, db, login, request, resetDatabase } from './helpers.js';

const json = (req) => req.set('Content-Type', 'application/json');

describe('create endpoints', () => {
  let token;

  before(async () => {
    await resetDatabase();
    token = await login();
  });
  after(() => db.destroy());

  it('onboards a school, course, student and enrollment using returned ids', async () => {
    const school = await authed(json(request(app).post('/schools')), token).send({
      name: 'Nova Tech Academy',
      city: 'Odesa',
    });
    assert.equal(school.status, 201);
    assert.ok(school.body.data.id);

    const schoolId = school.body.data.id;

    const course = await authed(json(request(app).post('/courses')), token).send({
      school_id: schoolId,
      title: 'Intro to Go',
      subject: 'Computer Science',
      credits: 6,
    });
    assert.equal(course.status, 201);
    assert.equal(course.body.data.school_id, schoolId);

    const student = await authed(json(request(app).post('/students')), token).send({
      school_id: schoolId,
      full_name: 'Ivan Petrenko',
      email: 'ivan@nova.example',
    });
    assert.equal(student.status, 201);
    assert.equal(student.body.data.school_id, schoolId);

    const enrollment = await authed(json(request(app).post('/enrollments')), token).send({
      student_id: student.body.data.id,
      course_id: course.body.data.id,
    });
    assert.equal(enrollment.status, 201);
    assert.equal(enrollment.body.data.status, 'active');

    // The rows must really be linked in the database, not just echoed back.
    const row = await db('enrollments')
      .join('students', 'students.id', 'enrollments.student_id')
      .join('courses', 'courses.id', 'enrollments.course_id')
      .where('enrollments.id', enrollment.body.data.id)
      .first('students.full_name', 'courses.title', 'courses.school_id');

    assert.equal(row.full_name, 'Ivan Petrenko');
    assert.equal(row.title, 'Intro to Go');
    assert.equal(row.school_id, schoolId);

    const summary = await authed(
      request(app).get(`/students/${student.body.data.id}`),
      token,
    );
    assert.equal(summary.body.data.school.name, 'Nova Tech Academy');
    assert.deepEqual(
      summary.body.data.enrollments.map((e) => e.course_title),
      ['Intro to Go'],
    );
  });

  it('rejects creates without a token', async () => {
    const res = await json(request(app).post('/schools')).send({ name: 'No Auth' });

    assert.equal(res.status, 401);
    const rows = await db('schools').where({ name: 'No Auth' });
    assert.equal(rows.length, 0, 'nothing should be written');
  });

  it('returns 409 when the same enrollment is created twice', async () => {
    const payload = { student_id: 1, course_id: 1 };
    const res = await authed(json(request(app).post('/enrollments')), token).send(payload);

    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'conflict');

    const rows = await db('enrollments').where(payload);
    assert.equal(rows.length, 1, 'the duplicate must not be stored');
  });

  it('returns 409 for a school with the same name in the same city', async () => {
    const payload = { name: 'Duplicate Academy', city: 'Kyiv' };

    const first = await authed(json(request(app).post('/schools')), token).send(payload);
    assert.equal(first.status, 201);

    const second = await authed(json(request(app).post('/schools')), token).send(payload);
    assert.equal(second.status, 409);
    assert.equal(second.body.error, 'conflict');

    const rows = await db('schools').where(payload);
    assert.equal(rows.length, 1, 'the duplicate must not be stored');
  });

  it('allows the same school name in a different city', async () => {
    const res = await authed(json(request(app).post('/schools')), token).send({
      name: 'Duplicate Academy',
      city: 'Lviv',
    });

    assert.equal(res.status, 201);
  });

  it('returns 404 when the parent school does not exist', async () => {
    const res = await authed(json(request(app).post('/courses')), token).send({
      school_id: 9999,
      title: 'Ghost Course',
    });

    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'not_found');
  });

  it('rejects enrolling a student into another school course', async () => {
    const otherSchoolCourse = await db('courses').where({ school_id: 2 }).first();
    const res = await authed(json(request(app).post('/enrollments')), token).send({
      student_id: 1,
      course_id: otherSchoolCourse.id,
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'bad_request');
  });

  it('rejects an invalid body with field details', async () => {
    const res = await authed(json(request(app).post('/students')), token).send({
      school_id: 1,
      full_name: '',
      email: 'nope',
    });

    assert.equal(res.status, 400);
    assert.deepEqual(
      res.body.details.map((d) => d.field).sort(),
      ['email', 'full_name'],
    );
  });
});
