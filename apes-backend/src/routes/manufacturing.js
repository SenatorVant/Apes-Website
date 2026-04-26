/**
 * routes/manufacturing.js  — MFG jobs + purchase orders
 */
const router = require('express').Router();
const { getDb } = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

// ── MFG Jobs ──────────────────────────────────────────────────────────────────

// GET /api/manufacturing/jobs
router.get('/jobs', requireAuth, (req, res) => {
  const db = getDb();
  const jobs = db.prepare(`
    SELECT m.*, u.name as assigned_name
    FROM mfg_jobs m LEFT JOIN users u ON u.id = m.assigned_to
    ORDER BY m.id
  `).all();
  res.json(jobs);
});

// POST /api/manufacturing/jobs
router.post('/jobs', requireAuth, requireRole('captain','mentor','admin'), (req, res) => {
  const { part_number, description, machine, material, revision, status, assigned_to, drawing_ref, notes } = req.body;
  if (!description) return res.status(400).json({ error: 'description required.' });

  const db = getDb();
  // Auto-generate job_id
  const count = db.prepare('SELECT COUNT(*) as c FROM mfg_jobs').get().c;
  const job_id = `MFG-${String(count + 1).padStart(3,'0')}`;

  const r = db.prepare(`
    INSERT INTO mfg_jobs (job_id, part_number, description, machine, material, revision, status, assigned_to, drawing_ref, notes)
    VALUES (@job_id, @part_number, @description, @machine, @material, @revision, @status, @assigned_to, @drawing_ref, @notes)
  `).run({ job_id, part_number:part_number||'', description, machine:machine||'', material:material||'', revision:revision||'A', status:status||'new', assigned_to:assigned_to||null, drawing_ref:drawing_ref||'', notes:notes||'' });

  const job = db.prepare(`
    SELECT m.*, u.name as assigned_name FROM mfg_jobs m
    LEFT JOIN users u ON u.id = m.assigned_to WHERE m.id=?
  `).get(r.lastInsertRowid);
  res.status(201).json(job);
});

// PUT /api/manufacturing/jobs/:id
router.put('/jobs/:id', requireAuth, requireRole('captain','mentor','admin'), (req, res) => {
  const db = getDb();
  if (!db.prepare('SELECT id FROM mfg_jobs WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Not found.' });

  const allowed = ['part_number','description','machine','material','revision','status','assigned_to','drawing_ref','notes'];
  const updates = {};
  for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
  const sets = Object.keys(updates).map(k=>`${k}=@${k}`).join(', ');
  if (sets) db.prepare(`UPDATE mfg_jobs SET ${sets}, updated_at=datetime('now') WHERE id=@id`).run({...updates, id:req.params.id});

  const job = db.prepare(`SELECT m.*, u.name as assigned_name FROM mfg_jobs m LEFT JOIN users u ON u.id=m.assigned_to WHERE m.id=?`).get(req.params.id);
  res.json(job);
});

// DELETE /api/manufacturing/jobs/:id
router.delete('/jobs/:id', requireAuth, requireRole('admin'), (req, res) => {
  const db = getDb();
  if (!db.prepare('SELECT id FROM mfg_jobs WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  db.prepare('DELETE FROM mfg_jobs WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Purchase Orders ───────────────────────────────────────────────────────────

// GET /api/manufacturing/orders
router.get('/orders', requireAuth, (req, res) => {
  const db = getDb();
  const orders = db.prepare(`
    SELECT po.*, u.name as requested_name, p.name as project_name
    FROM purchase_orders po
    LEFT JOIN users u ON u.id = po.requested_by
    LEFT JOIN projects p ON p.id = po.project_id
    ORDER BY po.id
  `).all();
  res.json(orders);
});

// POST /api/manufacturing/orders
router.post('/orders', requireAuth, (req, res) => {
  const { part_number, part_name, price, quantity, vendor_link, justification, project_id, status, notes } = req.body;
  if (!part_name) return res.status(400).json({ error: 'part_name required.' });

  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as c FROM purchase_orders').get().c;
  const po_id = `PO-${String(count + 1).padStart(3,'0')}`;

  const r = db.prepare(`
    INSERT INTO purchase_orders (po_id, part_number, part_name, price, quantity, vendor_link, requested_by, justification, project_id, status, notes)
    VALUES (@po_id, @part_number, @part_name, @price, @quantity, @vendor_link, @requested_by, @justification, @project_id, @status, @notes)
  `).run({ po_id, part_number:part_number||'', part_name, price:price||0, quantity:quantity||1, vendor_link:vendor_link||'', requested_by:req.user.id, justification:justification||'', project_id:project_id||null, status:status||'pending', notes:notes||'' });

  const order = db.prepare(`
    SELECT po.*, u.name as requested_name, p.name as project_name
    FROM purchase_orders po LEFT JOIN users u ON u.id=po.requested_by LEFT JOIN projects p ON p.id=po.project_id
    WHERE po.id=?
  `).get(r.lastInsertRowid);
  res.status(201).json(order);
});

// PUT /api/manufacturing/orders/:id
router.put('/orders/:id', requireAuth, requireRole('captain','mentor','admin'), (req, res) => {
  const db = getDb();
  if (!db.prepare('SELECT id FROM purchase_orders WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Not found.' });

  const allowed = ['part_number','part_name','price','quantity','vendor_link','justification','project_id','status','notes'];
  const updates = {};
  for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
  const sets = Object.keys(updates).map(k=>`${k}=@${k}`).join(', ');
  if (sets) db.prepare(`UPDATE purchase_orders SET ${sets}, updated_at=datetime('now') WHERE id=@id`).run({...updates, id:req.params.id});

  const order = db.prepare(`
    SELECT po.*, u.name as requested_name, p.name as project_name
    FROM purchase_orders po LEFT JOIN users u ON u.id=po.requested_by LEFT JOIN projects p ON p.id=po.project_id
    WHERE po.id=?
  `).get(req.params.id);
  res.json(order);
});

// DELETE /api/manufacturing/orders/:id
router.delete('/orders/:id', requireAuth, requireRole('admin'), (req, res) => {
  const db = getDb();
  if (!db.prepare('SELECT id FROM purchase_orders WHERE id=?').get(req.params.id)) return res.status(404).json({ error: 'Not found.' });
  db.prepare('DELETE FROM purchase_orders WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
