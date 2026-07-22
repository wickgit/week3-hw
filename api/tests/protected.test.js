import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { app, authed, db, login, request, resetDatabase } from './helpers.js';

describe('protected read endpoints', () => {
  let token;

  before(async () => {
    await resetDatabase();
    token = await login();
  });
  after(() => db.destroy());

  it('rejects requests without a token', async () => {
    const res = await request(app).get('/schools');

    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'unauthorized');
  });

  it('rejects a malformed token', async () => {
    const res = await authed(request(app).get('/schools'), 'not.a.token');

    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'unauthorized');
  });

  it('lists the seeded schools for an authenticated request', async () => {
    const res = await authed(request(app).get('/schools'), token);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 2);
    assert.deepEqual(
      res.body.data.map((s) => s.name),
      ['Bright Future Academy', 'Riverside College'],
    );
  });

  it('narrows the list with a search query', async () => {
    const res = await authed(request(app).get('/schools?q=kyiv'), token);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].city, 'Kyiv');
  });

  it('filters courses by school', async () => {
    const res = await authed(request(app).get('/courses?school_id=1'), token);

    assert.equal(res.status, 200);
    assert.ok(res.body.data.length > 0);
    assert.ok(res.body.data.every((c) => c.school_id === 1));
  });

  it('returns a student with their school and enrolled courses', async () => {
    const res = await authed(request(app).get('/students/1'), token);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.full_name, 'Olena Kovalenko');
    assert.equal(res.body.data.school.name, 'Bright Future Academy');
    assert.deepEqual(
      res.body.data.enrollments.map((e) => e.course_title).sort(),
      ['Intro to Python', 'Linear Algebra'],
    );
  });

  it('returns 404 for a student that does not exist', async () => {
    const res = await authed(request(app).get('/students/9999'), token);

    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'not_found');
  });
});
