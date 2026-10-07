const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateTransfer } = require('../src/services/transfer.service');
const valid = { fromAccount: 'a'.repeat(24), toAccount: 'b'.repeat(24), amount: 100, idempotencyKey: 'request-123' };
test('valid integer minor-unit transfer accepted', () => assert.doesNotThrow(() => validateTransfer(valid)));
test('amount boundary and type validation', () => {
  for (const amount of [0, -1, 1.5, NaN, Infinity, '1', null, {}, 1000000001])
    assert.throws(() => validateTransfer({ ...valid, amount }), { status: 400 });
  for (const amount of [1, 1000000000]) assert.doesNotThrow(() => validateTransfer({ ...valid, amount }));
});
test('IDs are validated and self transfers are case insensitive', () => {
  for (const fromAccount of [null, {}, 'abc', 'g'.repeat(24), 'A'.repeat(24)]) {
    assert.throws(() => validateTransfer({ ...valid, fromAccount, toAccount: 'a'.repeat(24) }), { status: 400 });
  }
});
test('idempotency keys must be bounded strings', () => {
  for (const idempotencyKey of [null, {}, '', 'a'.repeat(129), 'spaces not allowed'])
    assert.throws(() => validateTransfer({ ...valid, idempotencyKey }), { status: 400 });
});
