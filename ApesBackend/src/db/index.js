/**
 * db/index.js
 * Returns a single shared SQLite connection for the whole server process.
 */

const path     = require('path');
const Database = require('better-sqlite3');

let _db = null;

function getDb() {
  if (_db) return _db;
  const dbPath = path.resolve(process.env.DB_PATH || './data/teamOS.db');
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  return _db;
}

module.exports = { getDb };
