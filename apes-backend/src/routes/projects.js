/**
 * routes/projects.js  — full CRUD for projects
 */
const router = require('express').Router();
const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

// GET /api/projects
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const projects = db.prepare(`SELECT * FROM projects ORDER BY due_date, id`).all();
  // attach member initials
  const withMembers = projects.map(p => {
    const members = db.prepare(`
      SELECT u.id, u.name, u.role FROM project_members pm
      JOIN users u ON u.id = pm.user_id
      WHERE pm.project_id = ?
    `).all(p.id);
    return { ...p, members };
  });
  res.json(withMembers);
});

// POST /api/projects
router.post('/', requireAuth, requireRole('captain','mentor','admin'), (req, res) => {
  const { name, description, subteam, status, progress, due_date, member_ids } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required.' });
  const db = getDb();
  const r = db.prepare(`
    INSERT INTO projects (name, description, subteam, status, progress, due_date, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(name, description||'', subteam||'', status||'Active', progress||0, due_date||null, req.user.id);
  const pid = r.lastInsertRowid;
  if (Array.isArray(member_ids)) {
    const ins = db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?,?)');
    for (const uid of member_ids) ins.run(pid, uid);
  }
  const proj = db.prepare('SELECT * FROM projects WHERE id=?').get(pid);
  res.status(201).json(proj);
});

// PUT /api/projects/:id
router.put('/:id', requireAuth, requireRole('captain','mentor','admin'), (req, res) => {
  const db = getDb();
  const p = db.prepare('SELECT id FROM projects WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Project not found.' });

  const allowed = ['name','description','subteam','status','progress','due_date'];
  const updates = {};
  for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
  const sets = Object.keys(updates).map(k=>`${k}=@${k}`).join(', ');
  if (sets) db.prepare(`UPDATE projects SET ${sets}, updated_at=datetime('now') WHERE id=@id`).run({...updates,id:req.params.id});

  if (Array.isArray(req.body.member_ids)) {
    db.prepare('DELETE FROM project_members WHERE project_id=?').run(req.params.id);
    const ins = db.prepare('INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?,?)');
    for (const uid of req.body.member_ids) ins.run(req.params.id, uid);
  }
  res.json(db.prepare('SELECT * FROM projects WHERE id=?').get(req.params.id));
});

// DELETE /api/projects/:id
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const db = getDb();
  if (!db.prepare('SELECT id FROM projects WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  db.prepare('DELETE FROM projects WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
