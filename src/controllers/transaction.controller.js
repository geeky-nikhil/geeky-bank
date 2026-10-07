const Account = require('../models/account.model');
const { transfer, HttpError } = require('../services/transfer.service');
const email = require('../services/email.service');
async function execute(req, res, initialFunds) {
  const input = { fromAccount: req.body.fromAccount, toAccount: req.body.toAccount,
    amount: req.body.amount, idempotencyKey: req.body.idempotencyKey };
  if (initialFunds) {
    const account = await Account.findOne({ user: req.user._id, status: 'ACTIVE' }).sort({ _id: 1 });
    if (!account) throw new HttpError(400, 'System account not found');
    input.fromAccount = String(account._id);
  }
  const result = await transfer(input, req.user, { initialFunds });
  // Notifications are best effort and never change the committed transfer outcome.
  if (!result.replayed) {
    void email.sendTransactionEmail(req.user.email, req.user.name, input.amount, input.toAccount)
      .catch(() => console.error('Transaction notification failed'));
  }
  res.status(result.replayed ? 200 : 201).json(result);
}
module.exports = {
  createTransaction: (req, res) => execute(req, res, false),
  createInitialFundsTransaction: (req, res) => execute(req, res, true)
};
