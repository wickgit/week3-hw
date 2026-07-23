import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { app, db, request, resetDatabase, ADMIN } from './helpers.js';

const gql = (query, variables, token) => {
  const req = request(app).post('/graphql').send({ query, variables });
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};

async function login() {
  const res = await gql(
    'mutation($e:String!,$p:String!){ login(email:$e,password:$p){ token } }',
    { e: ADMIN.email, p: ADMIN.password },
  );
  return res.body.data.login.token;
}

describe('GraphQL', () => {
  let token;

  before(async () => {
    await resetDatabase();
    token = await login();
  });
  after(() => db.destroy());

  it('rejects an unauthenticated query', async () => {
    const res = await gql('{ schools { id } }');

    assert.equal(res.status, 401);
    assert.equal(res.body.errors[0].extensions.code, 'UNAUTHENTICATED');
  });

  it('logs in and returns a token', async () => {
    assert.ok(token, 'expected a token');
  });

  it('resolves nested relations in one query', async () => {
    const res = await gql(
      `{ school(id:1) {
          name
          courses { title enrollments { status student { full_name } } }
        } }`,
      {},
      token,
    );

    const school = res.body.data.school;
    assert.equal(school.name, 'Bright Future Academy');
    assert.deepEqual(
      school.courses.map((c) => c.title).sort(),
      ['Intro to Python', 'Linear Algebra'],
    );
    const python = school.courses.find((c) => c.title === 'Intro to Python');
    assert.deepEqual(
      python.enrollments.map((e) => e.student.full_name).sort(),
      ['Andriy Shevchenko', 'Olena Kovalenko'],
    );
  });

  it('creates records through mutations using returned ids', async () => {
    const school = await gql(
      'mutation($n:String!,$c:String){ createSchool(name:$n,city:$c){ id name } }',
      { n: 'GraphQL Institute', c: 'Kharkiv' },
      token,
    );
    const schoolId = school.body.data.createSchool.id;
    assert.ok(schoolId);

    const course = await gql(
      'mutation($s:Int!,$t:String!){ createCourse(schoolId:$s,title:$t,credits:5){ id school { id } } }',
      { s: schoolId, t: 'Intro to GraphQL' },
      token,
    );
    assert.equal(course.body.data.createCourse.school.id, schoolId);

    const student = await gql(
      'mutation($s:Int!,$n:String!,$e:String!){ createStudent(schoolId:$s,fullName:$n,email:$e){ id } }',
      { s: schoolId, n: 'Test Student', e: 'test@gql.example' },
      token,
    );

    const enrollment = await gql(
      'mutation($s:Int!,$c:Int!){ createEnrollment(studentId:$s,courseId:$c){ id status } }',
      { s: student.body.data.createStudent.id, c: course.body.data.createCourse.id },
      token,
    );
    assert.equal(enrollment.body.data.createEnrollment.status, 'active');
  });

  it('reports a conflict on a duplicate school', async () => {
    const vars = { n: 'Dup GQL School', c: 'Odesa' };
    const q = 'mutation($n:String!,$c:String){ createSchool(name:$n,city:$c){ id } }';

    const first = await gql(q, vars, token);
    assert.ok(first.body.data.createSchool.id);

    const second = await gql(q, vars, token);
    assert.equal(second.body.data, null);
    assert.equal(second.body.errors[0].extensions.code, 'CONFLICT');
  });

  it('batches child lookups with DataLoader (no N+1)', async () => {
    const queries = [];
    const listener = (q) => queries.push(q.sql);
    db.on('query', listener);

    await gql('{ schools { name courses { title } students { full_name } } }', {}, token);

    db.removeListener('query', listener);

    const courseQueries = queries.filter((sql) => /from "courses"/.test(sql));
    const studentQueries = queries.filter((sql) => /from "students"/.test(sql));

    // One batched query for all schools' courses, one for all students — not one per school.
    assert.equal(courseQueries.length, 1, `expected 1 courses query, got ${courseQueries.length}`);
    assert.equal(studentQueries.length, 1, `expected 1 students query, got ${studentQueries.length}`);
  });
});
