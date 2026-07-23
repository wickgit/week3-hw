import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { ADMIN, app, db, request, resetDatabase } from './helpers.js';

describe('POST /auth/login', () => {
  before(resetDatabase);
  after(() => db.destroy());

  it('returns a token and the user for valid credentials', async () => {
    const res = await request(app).post('/auth/login').send(ADMIN);

    assert.equal(res.status, 200);
    assert.ok(res.body.token, 'expected a token');
    assert.equal(res.body.user.email, ADMIN.email);
    assert.equal(res.body.user.role, 'admin');
    assert.equal(res.body.user.password_hash, undefined, 'must not leak the hash');
  });

  it('rejects a wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ ...ADMIN, password: 'wrong' });

    assert.equal(res.status, 401);
    assert.equal(res.body.error, 'invalid_credentials');
  });

  it('gives the same response for an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/auth/login')
      .send({ ...ADMIN, password: 'wrong' });
    const unknownEmail = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@school.example', password: ADMIN.password });

    assert.equal(unknownEmail.status, wrongPassword.status);
    assert.deepEqual(unknownEmail.body, wrongPassword.body);
  });

  it('rejects a malformed body with field details', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'not-an-email', password: '' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'bad_request');
    assert.deepEqual(
      res.body.details.map((d) => d.field).sort(),
      ['email', 'password'],
    );
  });
});
