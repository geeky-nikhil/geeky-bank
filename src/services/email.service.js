const nodemailer = require('nodemailer');
let transporter;
async function send(to, subject, text) {
  if (process.env.EMAIL_ENABLED !== 'true') return;
  transporter ||= nodemailer.createTransport({ service: 'gmail', auth: {
    type: 'OAuth2', user: process.env.EMAIL_USER, clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET, refreshToken: process.env.REFRESH_TOKEN
  }, connectionTimeout: 5000, socketTimeout: 10000 });
  await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, text });
}
module.exports = {
  sendRegistrationEmail: (to, name) => send(to, 'Welcome to Backend Ledger', `Hello ${name}, your account is ready.`),
  sendTransactionEmail: (to, name, amount, account) => send(to, 'Transfer completed',
    `Hello ${name}, your transfer of ${amount} minor currency units to ${account} completed.`)
};
