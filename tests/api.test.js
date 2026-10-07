const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const request = require('supertest');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'test-only-secret-at-least-32-characters';
process.env.EMAIL_ENABLED = 'false';
const app = require('../src/app');
const User = require('../src/models/user.model');
const Account = require('../src/models/account.model');
const Ledger = require('../src/models/ledger.model');
const Transaction = require('../src/models/transaction.model');
const email = require('../src/services/email.service');
let mongo, alice, bob, system, a, b, treasury;
const token = user => jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
const post = (user, data, path = '/api/transactions') => request(app).post(path).set('Authorization', `Bearer ${token(user)}`).send(data);
const payload = (key, amount = 100) => ({ fromAccount: String(a._id), toAccount: String(b._id), amount, idempotencyKey: key });
before(async () => {
  mongo = await MongoMemoryReplSet.create({ binary: { version: '7.0.24' }, replSet: { count: 1 } });
  await mongoose.connect(mongo.getUri());
  for (const model of Object.values(mongoose.models)) await model.init();
});
after(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });
beforeEach(async () => {
  // Raw cleanup is test-only: normal application writes go through the service.
  for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
  [alice, bob, system] = await User.create([
    { email: 'alice@example.com', name: 'Alice', password: 'password123' },
    { email: 'bob@example.com', name: 'Bob', password: 'password123' },
    { email: 'system@example.com', name: 'System', password: 'password123', systemUser: true }
  ]);
  [a, b, treasury] = await Account.create([{ user: alice._id }, { user: bob._id }, { user: system._id }]);
  const r = await post(system, { toAccount: String(a._id), amount: 1000, idempotencyKey: 'seed-funds-1' }, '/api/transactions/system/initial-funds');
  assert.equal(r.status, 201, JSON.stringify(r.body));
});
test('transfer balances and completed response; retries do not duplicate postings', async () => {
  const r = await post(alice, payload('transfer-001', 250));
  assert.equal(r.status, 201); assert.equal(r.body.transaction.status, 'COMPLETED');
  assert.equal(await a.getBalance(), 750); assert.equal(await b.getBalance(), 250);
  const retry = await post(alice, payload('transfer-001', 250));
  assert.equal(retry.status, 200); assert.equal(retry.body.replayed, true);
  assert.equal(await Ledger.countDocuments(), 4);
  assert.equal((await post(alice, payload('transfer-001', 300))).status, 409);
  assert.equal((await post(bob, payload('transfer-001', 250))).status, 409);
});
test('ownership and system-funding authorization', async () => {
  assert.equal((await post(bob, payload('unauthorized'))).status, 403);
  assert.equal((await post(alice, { toAccount: String(b._id), amount: 100, idempotencyKey: 'fund-attempt' }, '/api/transactions/system/initial-funds')).status, 403);
  assert.equal(await a.getBalance(), 1000);
});
test('reject invalid amounts, self transfer, IDs and keys', async () => {
  for (const amount of [-1, 0, 1.2, '100', 1e12, null])
    assert.equal((await post(alice, payload('bad-amount-1', amount))).status, 400);
  for (const patch of [{ toAccount: String(a._id) }, { fromAccount: 'bad' }, { idempotencyKey: 'x' }])
    assert.equal((await post(alice, { ...payload('invalid-request'), ...patch })).status, 400);
});
test('concurrent transfers cannot overspend', async () => {
  const results = await Promise.all([post(alice, payload('concurrent-1', 700)), post(alice, payload('concurrent-2', 700))]);
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  assert.equal(await a.getBalance(), 300); assert.equal(await b.getBalance(), 700);
});
test('simultaneous identical requests create one transfer', async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () => post(alice, payload('same-key-001', 200))));
  assert.equal(results.filter(r => r.status === 201).length, 1);
  assert.equal(results.filter(r => r.status === 200).length, 4);
  assert.equal(await a.getBalance(), 800); assert.equal(await Ledger.countDocuments(), 4);
});
test('failure after debit insert rolls back ledger, transaction and account locks', async () => {
  const original = Ledger.create;
  Ledger.create = async function (docs, options) { await original.call(this, [docs[0]], options); throw new Error('Injected write failure'); };
  try { assert.equal((await post(alice, payload('rollback-001'))).status, 500); }
  finally { Ledger.create = original; }
  assert.equal(await a.getBalance(), 1000); assert.equal(await b.getBalance(), 0);
  assert.equal(await Transaction.countDocuments(), 1); assert.equal(await Ledger.countDocuments(), 2);
  assert.equal((await Account.findById(a._id)).ledgerVersion, 1);
});
test('frozen accounts and currency mismatch reject atomically', async () => {
  await Account.updateOne({ _id: b._id }, { status: 'FROZEN' });
  assert.equal((await post(alice, payload('frozen-test'))).status, 400);
  await Account.updateOne({ _id: b._id }, { status: 'ACTIVE', currency: 'USD' });
  assert.equal((await post(alice, payload('currency-test'))).status, 400);
  assert.equal(await a.getBalance(), 1000);
});
test('notification failure does not turn a committed transfer into a failed API call', async () => {
  const original = email.sendTransactionEmail;
  email.sendTransactionEmail = async () => { throw new Error('SMTP unavailable'); };
  try { assert.equal((await post(alice, payload('mail-failure'))).status, 201); }
  finally { email.sendTransactionEmail = original; }
  assert.equal(await b.getBalance(), 100);
});
test('balance endpoint enforces ownership; deleted-user token is rejected', async () => {
  assert.equal((await request(app).get(`/api/accounts/balance/${a._id}`).set('Authorization', `Bearer ${token(bob)}`)).status, 404);
  await User.deleteOne({ _id: alice._id });
  assert.equal((await post(alice, payload('deleted-user'))).status, 401);
});
test('registration, login, protected cookie and logout revocation', async () => {
  const r = await request(app).post('/api/auth/register').send({ email: 'NEW@EXAMPLE.COM', name: 'New', password: 'password123', systemUser: true });
  assert.equal(r.status, 201); assert.equal(r.body.user.email, 'new@example.com');
  assert.match(r.headers['set-cookie'][0], /HttpOnly/); assert.match(r.headers['set-cookie'][0], /SameSite=Strict/);
  const user = await User.findById(r.body.user._id).select('+systemUser'); assert.equal(user.systemUser, false);
  const login = await request(app).post('/api/auth/login').send({ email: 'NEW@EXAMPLE.COM', password: 'password123' });
  assert.equal(login.status, 200);
  await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${login.body.token}`).expect(200);
  await request(app).get('/api/accounts').set('Authorization', `Bearer ${login.body.token}`).expect(401);
});
