const User = require('../models/user.model');
const jwt = require('jsonwebtoken');
const Blacklist = require('../models/blackList.model');
function tokenFrom(req) {
  return req.cookies?.token || (/^Bearer /i.test(req.headers.authorization || '') ? req.headers.authorization.slice(7) : null);
}
async function authMiddleware(req, res, next) {
  const token = tokenFrom(req);
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  let decoded;
  try { decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }); }
  catch { return res.status(401).json({ message: 'Invalid token' }); }
  if (await Blacklist.exists({ token })) return res.status(401).json({ message: 'Invalid token' });
  const user = await User.findById(decoded.userId).select('+systemUser');
  if (!user) return res.status(401).json({ message: 'Invalid token' });
  req.user = user;
  next();
}
async function authSystemUserMiddleware(req, res, next) {
  return authMiddleware(req, res, () => {
    if (!req.user.systemUser) return res.status(403).json({ message: 'System user required' });
    next();
  });
}
module.exports = { authMiddleware, authSystemUserMiddleware, tokenFrom };
