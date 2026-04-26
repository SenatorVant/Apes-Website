/**
 * routes/users.js
 * GET    /api/users         — list all users (roster)
 * POST   /api/users         — add a user (admin only)
 * PUT    /api/users/:id     — edit a user (admin only)
 * DELETE /api/users/:id     — remove a user (admin only)
 * PUT    /api/users/me/password — change own password
 */

const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const TEAM_DOMAIN = process.env.TEAM_DOMAIN || 'apesofwrath668.org';
const VALID_ROLES  = ['student', 'captain', 'mentor', 'admin'];

// GET /api/users
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const users = db.prepare(`
    SELECT id, email, name, role, avatar_url, created_at
    FROM users ORDER BY role, name
  `).all();
  res.json(users);
});

// POST /api/users  (admin only)
router.post('/', requireAuth, requireRole('admin'), (req, res) => {
  const { email, name, role, password } = req.body;
  if (!email || !name || !role) return res.status(400).json({ error: 'email, name and role are required.' });
  if (!email.endsWith('@' + TEAM_DOMAIN)) return res.status(400).json({ error: `Email must end in @${TEAM_DOMAIN}` });
  if (!VALID_ROLES.includes(role))         return res.status(400).json({ error: 'Invalid role.' });

  const db = getDb();
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const id = uuidv4();
  const defaultPass = role + '123';                       // team default
  const password_hash = bcrypt.hashSync(password || defaultPass, 10);
  db.prepare(`
    INSERT INTO users (id, email, name, role, password_hash)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, email.toLowerCase(), name, role, password_hash);

  const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id=?').get(id);
  res.status(201).json(user);
});

// PUT /api/users/me/password
router.put('/me/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required.' });
  if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!user.password_hash) return res.status(400).json({ error: 'This account uses Google Sign-In.' });

  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect.' });
  }
  db.prepare('UPDATE users SET password_hash=?, updated_at=datetime(\'now\') WHERE id=?')
    .run(bcrypt.hashSync(new_password, 10), user.id);
  res.json({ ok: true });
});

// PUT /api/users/:id  (admin only, or self for name)
router.put('/:id', requireAuth, (req, res) => {
  const isSelf  = req.params.id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Forbidden.' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const { name, email, role } = req.body;

  // Non-admins can only update their own name
  const newName  = name  || user.name;
  const newEmail = (isAdmin && email) ? email.toLowerCase() : user.email;
  const newRole  = (isAdmin && role && !isSelf) ? role : user.role;

  if (newEmail !== user.email) {
    if (!newEmail.endsWith('@' + TEAM_DOMAIN)) return res.status(400).json({ error: `Email must end in @${TEAM_DOMAIN}` });
    if (db.prepare('SELECT id FROM users WHERE email=? AND id!=?').get(newEmail, user.id)) {
      return res.status(409).json({ error: 'That email is already in use.' });
    }
  }

  db.prepare(`
    UPDATE users SET name=?, email=?, role=?, updated_at=datetime('now') WHERE id=?
  `).run(newName, newEmail, newRole, user.id);

  const updated = db.prepare('SELECT id, email, name, role, avatar_url FROM users WHERE id=?').get(user.id);
  res.json(updated);
});

// DELETE /api/users/:id  (admin only, cannot delete self)
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account.' });
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
