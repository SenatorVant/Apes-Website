const router   = require('express').Router();
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const TEAM_DOMAIN  = process.env.TEAM_DOMAIN || 'apesofwrath668.org';
const TOKEN_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';
const REFRESH_DAYS  = 30;

function makeAccessToken(user) {
  return jwt.sign({ id:user.id, email:user.email, name:user.name, role:user.role }, process.env.JWT_SECRET, { expiresIn: TOKEN_EXPIRES });
}
function makeRefreshToken() { return crypto.randomBytes(40).toString('hex'); }
function hashToken(t) { return crypto.createHash('sha256').update(t).digest('hex'); }

function storeRefreshToken(userId, raw) {
  const db = getDb();
  const expires = new Date(Date.now() + REFRESH_DAYS * 86400_000).toISOString();
  db.prepare(`INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?,?,?)`).run(userId, hashToken(raw), expires);
}

function setTokenCookies(res, access, refresh) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('access_token',  access,  { httpOnly:true, secure:isProd, sameSite:isProd?'strict':'lax', maxAge: 7*24*60*60*1000 });
  res.cookie('refresh_token', refresh, { httpOnly:true, secure:isProd, sameSite:isProd?'strict':'lax', maxAge: REFRESH_DAYS*24*60*60*1000, path:'/api/auth/refresh' });
}

function safeUser(u) { return { id:u.id, email:u.email, name:u.name, role:u.role }; }

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
  const addr = email.toLowerCase().trim();
  if (!addr.endsWith('@' + TEAM_DOMAIN)) return res.status(403).json({ error: `Access restricted to @${TEAM_DOMAIN} accounts.` });

  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(addr);
  if (!user) return res.status(401).json({ error: 'No account found for this email.' });
  if (role && user.role !== role) return res.status(403).json({ error: 'Incorrect credentials or insufficient permissions.' });
  if (!user.password_hash) return res.status(403).json({ error: 'This account uses Google Sign-In.' });
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Incorrect password.' });

  const access  = makeAccessToken(user);
  const refresh = makeRefreshToken();
  storeRefreshToken(user.id, refresh);
  setTokenCookies(res, access, refresh);
  res.json({ user: safeUser(user), accessToken: access });
});

// Google OAuth
const oauthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);

router.get('/google', (req, res) => {
  const url = oauthClient.generateAuthUrl({ access_type:'offline', scope:['openid','email','profile'], prompt:'select_account' });
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const front = process.env.FRONTEND_URL || 'http://localhost:3001';
  const { code, error } = req.query;
  if (error || !code) return res.redirect(`${front}/?auth_error=${error||'no_code'}`);
  try {
    const { tokens } = await oauthClient.getToken(code);
    const ticket     = await oauthClient.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload    = ticket.getPayload();
    const email      = payload.email.toLowerCase();
    if (!email.endsWith('@' + TEAM_DOMAIN)) return res.redirect(`${front}/?auth_error=wrong_domain`);
    const db   = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if (!user) return res.redirect(`${front}/?auth_error=not_in_roster`);
    if (!user.avatar_url && payload.picture) db.prepare('UPDATE users SET avatar_url=? WHERE id=?').run(payload.picture, user.id);
    const access = makeAccessToken(user), refresh = makeRefreshToken();
    storeRefreshToken(user.id, refresh);
    setTokenCookies(res, access, refresh);
    res.redirect(`${front}/?auth=ok&role=${user.role}`);
  } catch (e) {
    console.error('Google OAuth error:', e.message);
    res.redirect(`${process.env.FRONTEND_URL||'http://localhost:3001'}/?auth_error=server_error`);
  }
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  const raw = req.cookies?.refresh_token;
  if (!raw) return res.status(401).json({ error: 'No refresh token.' });
  const db  = getDb();
  const row = db.prepare(`
    SELECT rt.*, u.id as uid, u.email, u.name, u.role FROM refresh_tokens rt
    JOIN users u ON u.id=rt.user_id
    WHERE rt.token_hash=? AND rt.expires_at > datetime('now')
  `).get(hashToken(raw));
  if (!row) return res.status(401).json({ error: 'Invalid or expired refresh token.' });
  db.prepare('DELETE FROM refresh_tokens WHERE token_hash=?').run(hashToken(raw));
  const user    = { id:row.uid, email:row.email, name:row.name, role:row.role };
  const access  = makeAccessToken(user);
  const refresh = makeRefreshToken();
  storeRefreshToken(user.id, refresh);
  setTokenCookies(res, access, refresh);
  res.json({ user, accessToken: access });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const raw = req.cookies?.refresh_token;
  if (raw) getDb().prepare('DELETE FROM refresh_tokens WHERE token_hash=?').run(hashToken(raw));
  res.clearCookie('access_token');
  res.clearCookie('refresh_token', { path:'/api/auth/refresh' });
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = getDb().prepare('SELECT id,email,name,role,avatar_url,created_at FROM users WHERE id=?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json(user);
});

module.exports = router;
