/**
 * seed.js — Creates DB schema and seeds initial team data.
 * Run once: node src/db/seed.js
 */

const path = require('path');
// Load .env from the ApesBackend root (two levels up from src/db/)
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const fs       = require('fs');
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = process.env.DB_PATH || './data/teamOS.db';
const dir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(path.resolve(DB_PATH));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── SCHEMA ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT UNIQUE NOT NULL,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL CHECK(role IN ('student','captain','mentor','admin')),
    password_hash TEXT,
    avatar_url    TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    subteam     TEXT,
    status      TEXT DEFAULT 'Active',
    progress    INTEGER DEFAULT 0,
    due_date    TEXT,
    created_by  TEXT REFERENCES users(id),
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS project_members (
    project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
    user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (project_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    description TEXT,
    assigned_to TEXT REFERENCES users(id),
    project_id  INTEGER REFERENCES projects(id),
    category    TEXT,
    status      TEXT DEFAULT 'Not Started' CHECK(status IN ('Not Started','In Progress','Complete')),
    progress    INTEGER DEFAULT 0,
    due_date    TEXT,
    created_by  TEXT REFERENCES users(id),
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mfg_jobs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id      TEXT UNIQUE,
    part_number TEXT,
    description TEXT NOT NULL,
    machine     TEXT,
    material    TEXT,
    revision    TEXT DEFAULT 'A',
    status      TEXT DEFAULT 'new' CHECK(status IN ('new','design','mfg','complete')),
    assigned_to TEXT REFERENCES users(id),
    drawing_ref TEXT,
    notes       TEXT,
    updated_at  TEXT DEFAULT (datetime('now')),
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS purchase_orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    po_id         TEXT UNIQUE,
    part_number   TEXT,
    part_name     TEXT NOT NULL,
    price         REAL,
    quantity      INTEGER DEFAULT 1,
    vendor_link   TEXT,
    requested_by  TEXT REFERENCES users(id),
    justification TEXT,
    project_id    INTEGER REFERENCES projects(id),
    status        TEXT DEFAULT 'pending' CHECK(status IN ('pending','ordered','delivered','rejected')),
    notes         TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    date_str    TEXT NOT NULL,
    type        TEXT DEFAULT 'Meeting',
    visibility  TEXT DEFAULT 'all' CHECK(visibility IN ('all','mentors','captains','students')),
    link        TEXT,
    description TEXT,
    created_by  TEXT REFERENCES users(id),
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
    session_date TEXT NOT NULL,
    present      INTEGER DEFAULT 1,
    notes        TEXT,
    recorded_by  TEXT REFERENCES users(id),
    created_at   TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, session_date)
  );

  CREATE TABLE IF NOT EXISTS meetings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    day         INTEGER,
    month       TEXT,
    title       TEXT NOT NULL,
    summary     TEXT,
    tags        TEXT,
    created_by  TEXT REFERENCES users(id),
    created_at  TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    expires_at  TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now'))
  );
`);

// ─── SEED USERS ───────────────────────────────────────────────────────────────
const PASSES = { student:'student123', captain:'captain456', mentor:'mentor789', admin:'admin000' };
const ROSTER = [
  { email:'vedant.j@apesofwrath668.org',      name:'Vedant J',      role:'admin'   },
  { email:'alex.chen@apesofwrath668.org',     name:'Alex Chen',     role:'student' },
  { email:'mia.torres@apesofwrath668.org',    name:'Mia Torres',    role:'student' },
  { email:'lena.gupta@apesofwrath668.org',    name:'Lena Gupta',    role:'student' },
  { email:'omar.diaz@apesofwrath668.org',     name:'Omar Diaz',     role:'student' },
  { email:'jordan.rivera@apesofwrath668.org', name:'Jordan Rivera', role:'captain' },
  { email:'priya.nair@apesofwrath668.org',    name:'Priya Nair',    role:'captain' },
  { email:'dr.park@apesofwrath668.org',       name:'Dr. Sam Park',  role:'mentor'  },
  { email:'admin@apesofwrath668.org',         name:'Admin User',    role:'admin'   },
];

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (id, email, name, role, password_hash)
  VALUES (@id, @email, @name, @role, @password_hash)
`);

const userIds = {};
db.transaction(() => {
  for (const u of ROSTER) {
    const id = uuidv4();
    insertUser.run({ id, ...u, password_hash: bcrypt.hashSync(PASSES[u.role], 10) });
  }
})();

// Reload real IDs (handles re-runs gracefully)
for (const u of ROSTER) {
  const row = db.prepare('SELECT id FROM users WHERE email=?').get(u.email);
  if (row) userIds[u.email] = row.id;
}

// ─── SEED PROJECTS ────────────────────────────────────────────────────────────
const PROJECTS = [
  { name:'Swerve Drive Module', description:'Full swerve drivetrain design and build', subteam:'design',      status:'In Progress',   progress:67, due_date:'Apr 28' },
  { name:'Auto-Aim Shooter',    description:'Vision-based auto aiming shooter system',  subteam:'programming', status:'Design Review', progress:42, due_date:'May 3'  },
  { name:'Climber Assembly',    description:'End-game climber mechanism',               subteam:'machining',   status:'Manufacturing', progress:81, due_date:'Apr 25' },
  { name:'Outreach Campaign',   description:'Community outreach and media',             subteam:'outreach',    status:'Active',        progress:55, due_date:'May 10' },
];
const insProj = db.prepare(`INSERT OR IGNORE INTO projects (name,description,subteam,status,progress,due_date) VALUES (@name,@description,@subteam,@status,@progress,@due_date)`);
for (const p of PROJECTS) insProj.run(p);

const proj = (name) => db.prepare('SELECT id FROM projects WHERE name=?').get(name);

// ─── SEED TASKS ───────────────────────────────────────────────────────────────
const TASKS = [
  { title:'Design swerve pod CAD v3',      description:'Complete third revision with DR feedback',      assigned_to:userIds['alex.chen@apesofwrath668.org'],     project:'Swerve Drive Module', category:'design',      status:'In Progress', progress:50,  due_date:'Apr 25' },
  { title:'Write auto-aim vision pipeline', description:'Implement Limelight + PID controller',         assigned_to:userIds['jordan.rivera@apesofwrath668.org'], project:'Auto-Aim Shooter',    category:'programming', status:'Not Started', progress:0,   due_date:'Apr 28' },
  { title:'Mill swerve module housing',    description:'Aluminum billet per 668-SM-001 Rev B',          assigned_to:userIds['dr.park@apesofwrath668.org'],        project:'Swerve Drive Module', category:'machining',   status:'Complete',    progress:100, due_date:'Apr 22' },
  { title:'Update Canandcoder firmware',   description:'Flash all modules to latest firmware',           assigned_to:userIds['alex.chen@apesofwrath668.org'],     project:'Swerve Drive Module', category:'controls',    status:'In Progress', progress:50,  due_date:'Apr 24' },
  { title:'Submit Chairman Award essay',   description:'Draft and submit final FIRST submission',       assigned_to:userIds['jordan.rivera@apesofwrath668.org'], project:'Outreach Campaign',   category:'outreach',    status:'Not Started', progress:0,   due_date:'Apr 30' },
  { title:'Create sponsor deck slides',    description:'Update with 2024 season results',               assigned_to:userIds['dr.park@apesofwrath668.org'],        project:'Outreach Campaign',   category:'business',    status:'In Progress', progress:50,  due_date:'May 1'  },
  { title:'Film robot reveal video',       description:'Shoot B-roll for social reveal',                assigned_to:userIds['alex.chen@apesofwrath668.org'],     project:'Outreach Campaign',   category:'media',       status:'Not Started', progress:0,   due_date:'Apr 26' },
  { title:'Wire battery monitor system',   description:'Install and test battery monitoring',           assigned_to:userIds['jordan.rivera@apesofwrath668.org'], project:'Climber Assembly',    category:'electrical',  status:'Complete',    progress:100, due_date:'Apr 21' },
];
const insTask = db.prepare(`INSERT OR IGNORE INTO tasks (title,description,assigned_to,project_id,category,status,progress,due_date) VALUES (@title,@description,@assigned_to,@project_id,@category,@status,@progress,@due_date)`);
for (const t of TASKS) insTask.run({ ...t, project_id: proj(t.project)?.id || null });

// ─── SEED MFG ─────────────────────────────────────────────────────────────────
const MFG = [
  { job_id:'MFG-001', part_number:'668-SW-001', description:'Swerve Module Housing', machine:'CNC Mill',    material:'Aluminum Billet',   revision:'B', status:'complete', assigned_to:userIds['dr.park@apesofwrath668.org'],        drawing_ref:'668-SW-001-RevB.pdf' },
  { job_id:'MFG-002', part_number:'668-SW-002', description:'Swerve Wheel Bracket',  machine:'Manual Mill', material:'Aluminum L Bracket', revision:'A', status:'design',   assigned_to:userIds['alex.chen@apesofwrath668.org'],     drawing_ref:'' },
  { job_id:'MFG-003', part_number:'668-SH-001', description:'Shooter Side Plate',    machine:'Laser',       material:'Polycarbonate',      revision:'C', status:'mfg',      assigned_to:userIds['jordan.rivera@apesofwrath668.org'], drawing_ref:'668-SH-001-RevC.pdf' },
  { job_id:'MFG-004', part_number:'668-CL-001', description:'Climber Hook',          machine:'Router',      material:'Delrin',             revision:'A', status:'new',      assigned_to:userIds['dr.park@apesofwrath668.org'],        drawing_ref:'Not necessary' },
  { job_id:'MFG-005', part_number:'668-SH-002', description:'Flywheel Hub',          machine:'Lathe',       material:'Aluminum Billet',    revision:'B', status:'complete', assigned_to:userIds['alex.chen@apesofwrath668.org'],     drawing_ref:'668-SH-002-RevB.pdf' },
];
const insMfg = db.prepare(`INSERT OR IGNORE INTO mfg_jobs (job_id,part_number,description,machine,material,revision,status,assigned_to,drawing_ref) VALUES (@job_id,@part_number,@description,@machine,@material,@revision,@status,@assigned_to,@drawing_ref)`);
for (const m of MFG) insMfg.run(m);

// ─── SEED ORDERS ─────────────────────────────────────────────────────────────
const swerveId = proj('Swerve Drive Module')?.id;
const ORDERS = [
  { po_id:'PO-001', part_number:'REV-11-1300', part_name:'NEO v1.1 Motor',      price:39.99, quantity:4, vendor_link:'https://revrobotics.com', requested_by:userIds['jordan.rivera@apesofwrath668.org'], justification:'Replacement for swerve drive modules',      project_id:swerveId, status:'pending',   notes:'Expedite if possible' },
  { po_id:'PO-002', part_number:'AM-0347',     part_name:'Colson Wheel 4"',     price:8.50,  quantity:8, vendor_link:'https://andymark.com',     requested_by:userIds['alex.chen@apesofwrath668.org'],     justification:'Drive wheel replacements after testing wear', project_id:swerveId, status:'ordered',   notes:'' },
  { po_id:'PO-003', part_number:'WCP-SS-0890', part_name:'WCP Swerve X Module', price:280.0, quantity:4, vendor_link:'https://wcproducts.com',   requested_by:userIds['dr.park@apesofwrath668.org'],       justification:'Full swerve drivetrain upgrade for 2025',     project_id:swerveId, status:'delivered', notes:'Requires board approval' },
];
const insOrd = db.prepare(`INSERT OR IGNORE INTO purchase_orders (po_id,part_number,part_name,price,quantity,vendor_link,requested_by,justification,project_id,status,notes) VALUES (@po_id,@part_number,@part_name,@price,@quantity,@vendor_link,@requested_by,@justification,@project_id,@status,@notes)`);
for (const o of ORDERS) insOrd.run(o);

// ─── SEED EVENTS ─────────────────────────────────────────────────────────────
const EVENTS = [
  { title:'Week 4 District Competition', date_str:'Apr 26-27', type:'Competition', visibility:'all',      link:'https://frc.events', description:'District Event at Regional High School' },
  { title:'Mentor Design Review',        date_str:'Apr 25',    type:'Meeting',     visibility:'mentors',  link:'',                   description:'Internal DR with mentors and captains'  },
  { title:'Outreach Visit – Lincoln MS', date_str:'May 2',     type:'Outreach',    visibility:'all',      link:'',                   description:'Robotics demo for 6th graders' },
  { title:'Captain Strategy Session',    date_str:'May 5',     type:'Meeting',     visibility:'captains', link:'',                   description:'Season planning and alliance strategy' },
  { title:'Championship Qualifying',     date_str:'May 15-17', type:'Competition', visibility:'all',      link:'https://frc.events', description:'State Championship qualifying event' },
];
const insEv = db.prepare(`INSERT OR IGNORE INTO events (title,date_str,type,visibility,link,description) VALUES (@title,@date_str,@type,@visibility,@link,@description)`);
for (const e of EVENTS) insEv.run(e);

// ─── SEED MEETINGS ────────────────────────────────────────────────────────────
const MEETINGS = [
  { day:22, month:'Apr', title:'Week Build Session + Design Review',   summary:'Completed swerve module housing CAD. Reviewed shooter subsystem. Assigned 3 new MFG jobs. Discussed week 4 competition strategy.',  tags:JSON.stringify(['design','machining','strategy']) },
  { day:18, month:'Apr', title:'Programming Sprint + Controls Update', summary:'Merged auto-aim PR #47. Calibrated all swerve modules. Completed battery monitor wiring. Auto routine testing complete.',           tags:JSON.stringify(['programming','controls','electrical']) },
  { day:15, month:'Apr', title:'Outreach Planning + Business Review',  summary:'Finalized Lincoln MS visit. Updated sponsor deck with 2024 results. Submitted Chairman Award draft for review.',                    tags:JSON.stringify(['outreach','business','media']) },
];
const insMtg = db.prepare(`INSERT OR IGNORE INTO meetings (day,month,title,summary,tags) VALUES (@day,@month,@title,@summary,@tags)`);
for (const m of MEETINGS) insMtg.run(m);

// ─── SEED ATTENDANCE ─────────────────────────────────────────────────────────
const sessions = ['Apr 1','Apr 3','Apr 8','Apr 10','Apr 13','Apr 15','Apr 17','Apr 20','Apr 22','Apr 24'];
const attData = {
  'vedant.j@apesofwrath668.org':      [1,1,1,1,1,1,1,1,1,1],
  'alex.chen@apesofwrath668.org':     [1,1,1,0,1,1,1,1,0,1],
  'jordan.rivera@apesofwrath668.org': [1,1,0,1,1,1,0,1,1,1],
  'dr.park@apesofwrath668.org':       [1,1,1,1,1,1,1,1,1,1],
  'mia.torres@apesofwrath668.org':    [0,1,1,1,0,1,1,0,1,1],
  'lena.gupta@apesofwrath668.org':    [1,0,1,1,1,0,1,1,1,0],
};
const insAtt = db.prepare(`INSERT OR IGNORE INTO attendance (user_id,session_date,present) VALUES (@user_id,@session_date,@present)`);
for (const [email, arr] of Object.entries(attData)) {
  const uid = userIds[email];
  if (!uid) continue;
  arr.forEach((p, i) => insAtt.run({ user_id: uid, session_date: sessions[i], present: p }));
}

db.close();
console.log('✅  Database seeded at', path.resolve(DB_PATH));
console.log('\nDefault login credentials:');
console.log('  admin@apesofwrath668.org     / admin000');
console.log('  jordan.rivera@apesofwrath668.org / captain456');
console.log('  dr.park@apesofwrath668.org   / mentor789');
console.log('  alex.chen@apesofwrath668.org / student123');
