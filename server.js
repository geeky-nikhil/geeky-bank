require('dotenv').config();
const mongoose = require('mongoose');
const app = require('./src/app');
async function start() {
  if (!process.env.MONGO_URI || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new Error('Set MONGO_URI and a JWT_SECRET of at least 32 characters');
  await mongoose.connect(process.env.MONGO_URI);
  for (const model of Object.values(mongoose.models)) await model.init();
  const server = app.listen(process.env.PORT || 3000, () => console.log('Ledger API ready'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    server.close(async () => { await mongoose.disconnect(); process.exit(0); });
  });
}
start().catch(() => { console.error('Startup failed: verify environment and MongoDB connectivity'); process.exit(1); });
