const mongoose = require('mongoose');
const Account = require('../models/account.model');
const Transaction = require('../models/transaction.model');
const Ledger = require('../models/ledger.model');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function validateTransfer(input) {
  for (const field of ['fromAccount', 'toAccount']) {
    if (typeof input[field] !== 'string' || !/^[a-f\d]{24}$/i.test(input[field]))
      throw new HttpError(400, `Invalid ${field}`);
  }
  if (input.fromAccount.toLowerCase() === input.toAccount.toLowerCase())
    throw new HttpError(400, 'Sender and recipient must differ');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || input.amount > 1_000_000_000)
    throw new HttpError(400, 'amount must be a positive integer in minor units, at most 1000000000');
  if (typeof input.idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(input.idempotencyKey))
    throw new HttpError(400, 'idempotencyKey must contain 8-128 letters, digits, underscores or hyphens');
}
function replay(existing, input, actor) {
  if (String(existing.initiatedBy) !== String(actor._id) ||
      String(existing.fromAccount) !== input.fromAccount.toLowerCase() ||
      String(existing.toAccount) !== input.toAccount.toLowerCase() || existing.amount !== input.amount)
    throw new HttpError(409, 'Idempotency key is already bound to another request');
  if (existing.status !== 'COMPLETED') throw new HttpError(409, 'Transaction is not completed');
  return { transaction: existing, replayed: true };
}
async function transfer(input, actor, { initialFunds = false } = {}) {
  validateTransfer(input);
  if (initialFunds && !actor.systemUser) throw new HttpError(403, 'System user required');
  const session = await mongoose.startSession();
  try {
    return await session.withTransaction(async () => {
      const existing = await Transaction.findOne({ idempotencyKey: input.idempotencyKey }).session(session);
      if (existing) return replay(existing, input, actor);
      // Both accounts are written in stable order. Concurrent ledger writers therefore
      // conflict and retry with a fresh snapshot before evaluating available funds.
      const accounts = new Map();
      for (const id of [input.fromAccount.toLowerCase(), input.toAccount.toLowerCase()].sort()) {
        const account = await Account.findOneAndUpdate(
          { _id: id, status: 'ACTIVE' }, { $inc: { ledgerVersion: 1 } }, { session, new: true });
        if (!account) throw new HttpError(400, 'Both accounts must exist and be ACTIVE');
        accounts.set(id, account);
      }
      const sender = accounts.get(input.fromAccount.toLowerCase());
      const recipient = accounts.get(input.toAccount.toLowerCase());
      if (String(sender.user) !== String(actor._id)) throw new HttpError(403, 'Sender account is not yours');
      if (sender.currency !== recipient.currency) throw new HttpError(400, 'Currencies must match');
      const balance = await sender.getBalance(session);
      const recipientBalance = await recipient.getBalance(session);
      if (!Number.isSafeInteger(balance) || !Number.isSafeInteger(recipientBalance) ||
          !Number.isSafeInteger(balance - input.amount) || !Number.isSafeInteger(recipientBalance + input.amount))
        throw new HttpError(409, 'Balance exceeds supported integer range');
      if (!initialFunds && balance < input.amount) throw new HttpError(409, 'Insufficient balance');
      const [transaction] = await Transaction.create([{ ...input, initiatedBy: actor._id, status: 'COMPLETED' }], { session });
      await Ledger.create([
        { account: sender._id, transaction: transaction._id, amount: input.amount, type: 'DEBIT' },
        { account: recipient._id, transaction: transaction._id, amount: input.amount, type: 'CREDIT' }
      ], { session, ordered: true });
      return { transaction, replayed: false };
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
  } catch (error) {
    // A simultaneous request can win the unique-key race after our initial read.
    if (error.code === 11000) {
      const existing = await Transaction.findOne({ idempotencyKey: input.idempotencyKey });
      if (existing) return replay(existing, input, actor);
    }
    throw error;
  } finally { await session.endSession(); }
}
module.exports = { transfer, HttpError, validateTransfer };
