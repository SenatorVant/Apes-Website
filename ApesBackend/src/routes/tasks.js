/**
 * routes/tasks.js
 * GET    /api/tasks
 * POST   /api/tasks
 * PUT    /api/tasks/:id
 * DELETE /api/tasks/:id
 */

const router = require('express').Router();
const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const VALID_STATUS = ['Not Started', 'In Progress', 'Complete'];

function allTasks(db) {
  return db.prepare(`
    SELECT t.*, u.name as assigned_name, p.name as project_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    LEFT JOIN projects p ON p.id = t.project_id
    ORDER BY t.due_date, t.id
  `).all();
}

// GET /api/tasks
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  let tasks = allTasks(db);

  // Students only see tasks assigned to them or unassigned
  if (req.user.role === 'student') {
    tasks = tasks.filter(t => !t.assigned_to || t.assigned_to === req.user.id);
  }

  // Optional filters from query string
  const { status, category, project_id } = req.query;
  if (status)     tasks = tasks.filter(t => t.status === status);
  if (category)   tasks = tasks.filter(t => t.category === category);
  if (project_id) tasks = tasks.filter(t => t.project_id == project_id);

  res.json(tasks);
});

// POST /api/tasks
router.post('/', requireAuth, requireRole('captain', 'mentor', 'admin'), (req, res) => {
  const { title, description, assigned_to, project_id, category, status, progress, due_date } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required.' });

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO tasks (title, description, assigned_to, project_id, category, status, progress, due_date, created_by)
    VALUES (@title, @description, @assigned_to, @project_id, @category, @status, @progress, @due_date, @created_by)
  `).run({
    title, description: description || '',
    assigned_to: assigned_to || null,
    project_id:  project_id  || null,
    category:    category    || null,
    status:      VALID_STATUS.includes(status) ? status : 'Not Started',
    progress:    progress ?? 0,
    due_date:    due_date || null,
    created_by:  req.user.id,
  });

  const task = db.prepare(`
    SELECT t.*, u.name as assigned_name, p.name as project_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(task);
});

// PUT /api/tasks/:id
router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });

  // Students can only update progress/status on tasks assigned to them
  const isAssignee = task.assigned_to === req.user.id;
  const canEdit = ['captain','mentor','admin'].includes(req.user.role) || isAssignee;
  if (!canEdit) return res.status(403).json({ error: 'Forbidden.' });

  const allowed = ['title','description','assigned_to','project_id','category','status','progress','due_date'];
  const updates = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }
  if (updates.status === 'Complete') updates.progress = 100;
  if (updates.status === 'Not Started') updates.progress = updates.progress ?? 0;

  const sets = Object.keys(updates).map(k => `${k}=@${k}`).join(', ');
  if (sets) {
    db.prepare(`UPDATE tasks SET ${sets}, updated_at=datetime('now') WHERE id=@id`)
      .run({ ...updates, id: req.params.id });
  }

  const updated = db.prepare(`
    SELECT t.*, u.name as assigned_name, p.name as project_name
    FROM tasks t
    LEFT JOIN users u ON u.id = t.assigned_to
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.id = ?
  `).get(req.params.id);
  res.json(updated);
});

// DELETE /api/tasks/:id
router.delete('/:id', requireAuth, requireRole('captain', 'mentor', 'admin'), (req, res) => {
  const db = getDb();
  const task = db.prepare('SELECT id FROM tasks WHERE id=?').get(req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  db.prepare('DELETE FROM tasks WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
