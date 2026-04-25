/**
 * routes/auth.js
 * POST /api/auth/login          — email + password login
 * GET  /api/auth/google         — start Google OAuth flow
 * GET  /api/auth/google/callback — Google OAuth callback
 * POST /api/auth/refresh        — refresh access token
 * POST /api/auth/logout         — clear tokens
 * GET  /api/auth/me             — return current user
 */

const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

const TEAM_DOMAIN = process.env.TEAM_DOMAIN || 'apesofwrath668.org';
const TOKEN_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';
const REFRESH_DAYS  = 30;

// ── helpers ──────────────────────────────────────────────────────────────────

function makeAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_EXPIRES }
  );
}

function makeRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

function storeRefreshToken(userId, rawToken) {
  const db = getDb();
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expires = new Date(Date.now() + REFRESH_DAYS * 86400_000).toISOString();
  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(userId, hash, expires);
}

function setTokenCookies(res, accessToken, refreshToken) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000,  // 7d
  });
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure:   isProd,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge:   REFRESH_DAYS * 24 * 60 * 60 * 1000,
    path:     '/api/auth/refresh',
  });
}

function userPayload(u) {
  return { id: u.id, email: u.email, name: u.name, role: u.role };
}

// ── routes ───────────────────────────────────────────────────────────────────

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required.' });
  if (!email.endsWith('@' + TEAM_DOMAIN)) {
    return res.status(403).json({ error: `Access restricted to @${TEAM_DOMAIN} accounts.` });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
  if (!user) return res.status(401).json({ error: 'No account found for this email.' });

  // Optional role check (mirrors frontend behaviour)
  if (role && user.role !== role) {
    return res.status(403).json({ error: 'Incorrect credentials or insufficient permissions.' });
  }

  if (!user.password_hash) {
    return res.status(403).json({ error: 'This account uses Google Sign-In. Please use the Google button.' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password. Please try again.' });

  const accessToken  = makeAccessToken(user);
  const refreshToken = makeRefreshToken();
  storeRefreshToken(user.id, refreshToken);
  setTokenCookies(res, accessToken, refreshToken);

  res.json({ user: userPayload(user), accessToken });
});

// ── Google OAuth ──────────────────────────────────────────────────────────────

const oauthClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// GET /api/auth/google  — redirect user to Google
router.get('/google', (req, res) => {
  const url = oauthClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
  });
  res.redirect(url);
});

// GET /api/auth/google/callback
router.get('/google/callback', async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const { code, error } = req.query;

  if (error) return res.redirect(`${frontendUrl}/?auth_error=${encodeURIComponent(error)}`);
  if (!code)  return res.redirect(`${frontendUrl}/?auth_error=no_code`);

  try {
    const { tokens }   = await oauthClient.getToken(code);
    const ticket       = await oauthClient.verifyIdToken({
      idToken:  tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email   = payload.email.toLowerCase();

    if (!email.endsWith('@' + TEAM_DOMAIN)) {
      return res.redirect(`${frontendUrl}/?auth_error=wrong_domain`);
    }

    const db   = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.redirect(`${frontendUrl}/?auth_error=not_in_roster`);
    }

    // Update avatar from Google if not set
    if (!user.avatar_url && payload.picture) {
      db.prepare('UPDATE users SET avatar_url=? WHERE id=?').run(payload.picture, user.id);
    }

    const accessToken  = makeAccessToken(user);
    const refreshToken = makeRefreshToken();
    storeRefreshToken(user.id, refreshToken);
    setTokenCookies(res, accessToken, refreshToken);

    // Redirect back to frontend with success flag
    res.redirect(`${frontendUrl}/?auth=ok&role=${user.role}`);
  } catch (err) {
    console.error('Google OAuth error:', err.message);
    res.redirect(`${frontendUrl}/?auth_error=server_error`);
  }
});

// POST /api/auth/refresh
router.post('/refresh', (req, res) => {
  const rawToken = req.cookies?.refresh_token;
  if (!rawToken) return res.status(401).json({ error: 'No refresh token.' });

  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const db   = getDb();
  const row  = db.prepare(`
    SELECT rt.*, u.id as uid, u.email, u.name, u.role
    FROM refresh_tokens rt
    JOIN users u ON u.id = rt.user_id
    WHERE rt.token_hash = ?
      AND rt.expires_at > datetime('now')
  `).get(hash);

  if (!row) return res.status(401).json({ error: 'Invalid or expired refresh token.' });

  // Rotate: delete old, issue new
  db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(hash);
  const newRefresh = makeRefreshToken();
  storeRefreshToken(row.uid, newRefresh);

  const user = { id: row.uid, email: row.email, name: row.name, role: row.role };
  const accessToken = makeAccessToken(user);
  setTokenCookies(res, accessToken, newRefresh);

  res.json({ user: userPayload(user), accessToken });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  const rawToken = req.cookies?.refresh_token;
  if (rawToken) {
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
    getDb().prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(hash);
  }
  res.clearCookie('access_token');
  res.clearCookie('refresh_token', { path: '/api/auth/refresh' });
  res.json({ ok: true });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = getDb().prepare('SELECT id, email, name, role, avatar_url, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json(user);
});

module.exports = router;
