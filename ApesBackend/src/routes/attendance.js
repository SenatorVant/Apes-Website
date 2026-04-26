const router = require('express').Router();
const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => {
  const db    = getDb();
  const users = db.prepare('SELECT id,name,role FROM users ORDER BY role,name').all();
  res.json(users.map(u => ({
    ...u,
    sessions: db.prepare('SELECT session_date,present FROM attendance WHERE user_id=? ORDER BY session_date').all(u.id)
  })));
});

router.get('/sessions', requireAuth, (req, res) => {
  res.json(getDb().prepare('SELECT DISTINCT session_date FROM attendance ORDER BY session_date').all().map(r => r.session_date));
});

router.post('/', requireAuth, requireRole('captain','mentor','admin'), (req, res) => {
  const { user_id, session_date, present, notes } = req.body;
  if (!user_id || !session_date) return res.status(400).json({ error: 'user_id and session_date required.' });
  getDb().prepare(`
    INSERT INTO attendance (user_id,session_date,present,notes,recorded_by) VALUES (@user_id,@session_date,@present,@notes,@recorded_by)
    ON CONFLICT(user_id,session_date) DO UPDATE SET present=@present,notes=@notes,recorded_by=@recorded_by
  `).run({ user_id, session_date, present:present?1:0, notes:notes||null, recorded_by:req.user.id });
  res.json({ ok: true });
});

router.post('/bulk', requireAuth, requireRole('captain','mentor','admin'), (req, res) => {
  const { session_date, records } = req.body;
  if (!session_date || !Array.isArray(records)) return res.status(400).json({ error: 'session_date and records[] required.' });
  const db  = getDb();
  const ins = db.prepare(`
    INSERT INTO attendance (user_id,session_date,present,recorded_by) VALUES (@user_id,@session_date,@present,@recorded_by)
    ON CONFLICT(user_id,session_date) DO UPDATE SET present=@present,recorded_by=@recorded_by
  `);
  db.transaction(() => { for (const r of records) ins.run({ user_id:r.user_id, session_date, present:r.present?1:0, recorded_by:req.user.id }); })();
  res.json({ ok:true, count:records.length });
});

module.exports = router;
