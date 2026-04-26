/**
 * routes/events.js
 */
const router = require('express').Router();
const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/events
router.get('/', requireAuth, (req, res) => {
  const db   = getDb();
  const role = req.user.role;
  // Filter by visibility
  const visFilter = {
    admin:   ['all','mentors','captains','students'],
    mentor:  ['all','mentors'],
    captain: ['all','captains'],
    student: ['all','students'],
  }[role] || ['all'];

  const placeholders = visFilter.map(() => '?').join(',');
  const events = db.prepare(`SELECT * FROM events WHERE visibility IN (${placeholders}) ORDER BY rowid`).all(...visFilter);
  res.json(events);
});

// POST /api/events
router.post('/', requireAuth, requireRole('captain','mentor','admin'), (req, res) => {
  const { title, date_str, type, visibility, link, description } = req.body;
  if (!title || !date_str) return res.status(400).json({ error: 'title and date_str are required.' });
  const db = getDb();
  const r = db.prepare(`
    INSERT INTO events (title, date_str, type, visibility, link, description, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(title, date_str, type||'Meeting', visibility||'all', link||'', description||'', req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM events WHERE id=?').get(r.lastInsertRowid));
});

// PUT /api/events/:id
router.put('/:id', requireAuth, requireRole('captain','mentor','admin'), (req, res) => {
  const db = getDb();
  if (!db.prepare('SELECT id FROM events WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  const allowed = ['title','date_str','type','visibility','link','description'];
  const updates = {};
  for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
  const sets = Object.keys(updates).map(k=>`${k}=@${k}`).join(', ');
  if (sets) db.prepare(`UPDATE events SET ${sets} WHERE id=@id`).run({...updates, id:req.params.id});
  res.json(db.prepare('SELECT * FROM events WHERE id=?').get(req.params.id));
});

// DELETE /api/events/:id
router.delete('/:id', requireAuth, requireRole('captain','mentor','admin'), (req, res) => {
  const db = getDb();
  if (!db.prepare('SELECT id FROM events WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  db.prepare('DELETE FROM events WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
