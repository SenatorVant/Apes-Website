/**
 * routes/meetings.js
 */
const router = require('express').Router();
const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => {
  res.json(getDb().prepare('SELECT * FROM meetings ORDER BY rowid DESC').all().map(m => ({
    ...m, tags: JSON.parse(m.tags || '[]')
  })));
});

router.post('/', requireAuth, requireRole('captain','mentor','admin'), (req, res) => {
  const { day, month, title, summary, tags } = req.body;
  if (!title) return res.status(400).json({ error: 'title required.' });
  const db = getDb();
  const r = db.prepare(`
    INSERT INTO meetings (day, month, title, summary, tags, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(day||null, month||null, title, summary||'', JSON.stringify(tags||[]), req.user.id);
  const row = db.prepare('SELECT * FROM meetings WHERE id=?').get(r.lastInsertRowid);
  res.status(201).json({ ...row, tags: JSON.parse(row.tags||'[]') });
});

router.put('/:id', requireAuth, requireRole('captain','mentor','admin'), (req, res) => {
  const db = getDb();
  if (!db.prepare('SELECT id FROM meetings WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  const { day, month, title, summary, tags } = req.body;
  db.prepare(`UPDATE meetings SET day=?, month=?, title=?, summary=?, tags=? WHERE id=?`)
    .run(day, month, title, summary, JSON.stringify(tags||[]), req.params.id);
  const row = db.prepare('SELECT * FROM meetings WHERE id=?').get(req.params.id);
  res.json({ ...row, tags: JSON.parse(row.tags||'[]') });
});

router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const db = getDb();
  if (!db.prepare('SELECT id FROM meetings WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  db.prepare('DELETE FROM meetings WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
