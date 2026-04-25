/**
 * routes/attendance.js
 */
const router = require('express').Router();
const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/attendance  — all records grouped by user
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const users = db.prepare(`SELECT id, name, role FROM users ORDER BY role, name`).all();
  const records = users.map(u => {
    const sessions = db.prepare(`
      SELECT session_date, present FROM attendance
      WHERE user_id = ? ORDER BY session_date
    `).all(u.id);
    return { ...u, sessions };
  });
  res.json(records);
});

// GET /api/attendance/sessions — list unique session dates
router.get('/sessions', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT DISTINCT session_date FROM attendance ORDER BY session_date`).all();
  res.json(rows.map(r => r.session_date));
});

// POST /api/attendance  — record or update a session for a user
// Body: { user_id, session_date, present (0|1) }
router.post('/', requireAuth, requireRole('captain','mentor','admin'), (req, res) => {
  const { user_id, session_date, present, notes } = req.body;
  if (!user_id || !session_date) return res.status(400).json({ error: 'user_id and session_date required.' });

  const db = getDb();
  db.prepare(`
    INSERT INTO attendance (user_id, session_date, present, notes, recorded_by)
    VALUES (@user_id, @session_date, @present, @notes, @recorded_by)
    ON CONFLICT(user_id, session_date) DO UPDATE SET present=@present, notes=@notes, recorded_by=@recorded_by
  `).run({ user_id, session_date, present: present ? 1 : 0, notes: notes||null, recorded_by: req.user.id });

  res.json({ ok: true });
});

// POST /api/attendance/bulk  — set attendance for an entire session
// Body: { session_date, records: [{ user_id, present }] }
router.post('/bulk', requireAuth, requireRole('captain','mentor','admin'), (req, res) => {
  const { session_date, records } = req.body;
  if (!session_date || !Array.isArray(records)) return res.status(400).json({ error: 'session_date and records[] required.' });

  const db = getDb();
  const ins = db.prepare(`
    INSERT INTO attendance (user_id, session_date, present, recorded_by)
    VALUES (@user_id, @session_date, @present, @recorded_by)
    ON CONFLICT(user_id, session_date) DO UPDATE SET present=@present, recorded_by=@recorded_by
  `);
  const bulk = db.transaction(() => {
    for (const r of records) ins.run({ user_id: r.user_id, session_date, present: r.present ? 1 : 0, recorded_by: req.user.id });
  });
  bulk();
  res.json({ ok: true, count: records.length });
});

module.exports = router;
