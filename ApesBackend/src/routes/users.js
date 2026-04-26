const router = require('express').Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const TEAM_DOMAIN = process.env.TEAM_DOMAIN || 'apesofwrath668.org';
const VALID_ROLES  = ['student','captain','mentor','admin'];

router.get('/', requireAuth, (req, res) => {
  res.json(getDb().prepare('SELECT id,email,name,role,avatar_url,created_at FROM users ORDER BY role,name').all());
});

router.post('/', requireAuth, requireRole('admin'), (req, res) => {
  const { email, name, role, password } = req.body;
  if (!email || !name || !role) return res.status(400).json({ error: 'email, name and role required.' });
  if (!email.endsWith('@' + TEAM_DOMAIN)) return res.status(400).json({ error: `Email must end in @${TEAM_DOMAIN}` });
  if (!VALID_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role.' });
  const db = getDb();
  if (db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase())) return res.status(409).json({ error: 'Email already exists.' });
  const id = uuidv4();
  db.prepare('INSERT INTO users (id,email,name,role,password_hash) VALUES (?,?,?,?,?)').run(id, email.toLowerCase(), name, role, bcrypt.hashSync(password || role+'123', 10));
  res.status(201).json(db.prepare('SELECT id,email,name,role,created_at FROM users WHERE id=?').get(id));
});

router.put('/me/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required.' });
  if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });
  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!user.password_hash) return res.status(400).json({ error: 'This account uses Google Sign-In.' });
  if (!bcrypt.compareSync(current_password, user.password_hash)) return res.status(401).json({ error: 'Current password incorrect.' });
  db.prepare("UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?").run(bcrypt.hashSync(new_password, 10), user.id);
  res.json({ ok: true });
});

router.put('/:id', requireAuth, (req, res) => {
  const isSelf  = req.params.id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isSelf && !isAdmin) return res.status(403).json({ error: 'Forbidden.' });
  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  const newName  = req.body.name  || user.name;
  const newEmail = (isAdmin && req.body.email) ? req.body.email.toLowerCase() : user.email;
  const newRole  = (isAdmin && req.body.role && !isSelf) ? req.body.role : user.role;
  db.prepare("UPDATE users SET name=?,email=?,role=?,updated_at=datetime('now') WHERE id=?").run(newName, newEmail, newRole, user.id);
  res.json(db.prepare('SELECT id,email,name,role,avatar_url FROM users WHERE id=?').get(user.id));
});

router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account.' });
  const db = getDb();
  if (!db.prepare('SELECT id FROM users WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'User not found.' });
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
