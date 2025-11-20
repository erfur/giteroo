const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const logger = require('../services/logger');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/giteroo.db');

let db = null;
let SQL = null;

async function initDatabase() {
  try {
    const SQL_MODULE = await initSqlJs();
    SQL = SQL_MODULE;
    
    let buffer = null;
    if (fs.existsSync(DB_PATH)) {
      buffer = fs.readFileSync(DB_PATH);
    }
    
    db = new SQL.Database(buffer);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS repositories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        remote_url TEXT NOT NULL,
        username TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        tags TEXT DEFAULT '',
        backup_interval TEXT DEFAULT '1d',
        enabled INTEGER DEFAULT 1,
        last_status TEXT DEFAULT 'unknown',
        last_backup_at TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(username, repo_name)
      )
    `);
    
    saveDatabase();
    logger.info('Database initialized');
  } catch (error) {
    logger.error('Failed to initialize database', error);
    throw error;
  }
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function getAll(filters = {}) {
  let query = 'SELECT * FROM repositories WHERE 1=1';
  const params = [];
  
  if (filters.tag) {
    query += ' AND tags LIKE ?';
    params.push(`%${filters.tag}%`);
  }
  
  if (filters.search) {
    query += ' AND (remote_url LIKE ? OR username LIKE ? OR repo_name LIKE ?)';
    const searchTerm = `%${filters.search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  
  query += ' ORDER BY created_at DESC';
  
  const stmt = db.prepare(query);
  if (params.length > 0) {
    stmt.bind(params);
  }
  
  const results = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push({
      id: row.id,
      remote_url: row.remote_url,
      username: row.username,
      repo_name: row.repo_name,
      tags: row.tags || '',
      backup_interval: row.backup_interval,
      enabled: row.enabled === 1,
      last_status: row.last_status,
      last_backup_at: row.last_backup_at,
      created_at: row.created_at
    });
  }
  stmt.free();
  
  return results;
}

function getTotalCount() {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM repositories');
  stmt.step();
  const result = stmt.getAsObject();
  stmt.free();
  return result ? result.count : 0;
}

function getById(id) {
  const stmt = db.prepare('SELECT * FROM repositories WHERE id = ?');
  stmt.bind([id]);
  
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  
  const row = stmt.getAsObject();
  stmt.free();
  
  return {
    id: row.id,
    remote_url: row.remote_url,
    username: row.username,
    repo_name: row.repo_name,
    tags: row.tags || '',
    backup_interval: row.backup_interval,
    enabled: row.enabled === 1,
    last_status: row.last_status,
    last_backup_at: row.last_backup_at,
    created_at: row.created_at
  };
}

function existsByUsernameAndRepo(username, repoName) {
  const stmt = db.prepare('SELECT id FROM repositories WHERE username = ? AND repo_name = ?');
  stmt.bind([username, repoName]);
  
  const exists = stmt.step();
  stmt.free();
  
  return exists;
}

function create(data) {
  try {
    if (existsByUsernameAndRepo(data.username, data.repo_name)) {
      throw new Error('Repository already exists');
    }
    
    const stmt = db.prepare(`
      INSERT INTO repositories (remote_url, username, repo_name, tags, backup_interval, enabled)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.bind([
      data.remote_url,
      data.username,
      data.repo_name,
      data.tags || '',
      data.backup_interval || '1d',
      data.enabled !== false ? 1 : 0
    ]);
    
    stmt.step();
    stmt.free();
    
    const idResult = db.exec('SELECT last_insert_rowid() as id');
    let id = null;
    if (idResult && idResult.length > 0 && idResult[0].values.length > 0) {
      id = idResult[0].values[0][0];
    }
    
    if (!id || id === 0) {
      throw new Error('Failed to get inserted repository ID');
    }
    
    saveDatabase();
    
    const repo = getById(id);
    if (!repo) {
      throw new Error('Failed to retrieve created repository');
    }
    
    return repo;
  } catch (error) {
    logger.error('Failed to create repository:', error);
    throw error;
  }
}

function update(id, data) {
  const updates = [];
  const params = [];
  
  if (data.remote_url !== undefined) {
    updates.push('remote_url = ?');
    params.push(data.remote_url);
  }
  if (data.username !== undefined) {
    updates.push('username = ?');
    params.push(data.username);
  }
  if (data.repo_name !== undefined) {
    updates.push('repo_name = ?');
    params.push(data.repo_name);
  }
  if (data.tags !== undefined) {
    updates.push('tags = ?');
    params.push(data.tags);
  }
  if (data.backup_interval !== undefined) {
    updates.push('backup_interval = ?');
    params.push(data.backup_interval);
  }
  if (data.enabled !== undefined) {
    updates.push('enabled = ?');
    params.push(data.enabled ? 1 : 0);
  }
  if (data.last_status !== undefined) {
    updates.push('last_status = ?');
    params.push(data.last_status);
  }
  if (data.last_backup_at !== undefined) {
    updates.push('last_backup_at = ?');
    params.push(data.last_backup_at);
  }
  
  if (updates.length === 0) {
    return getById(id);
  }
  
  params.push(id);
  const stmt = db.prepare(`UPDATE repositories SET ${updates.join(', ')} WHERE id = ?`);
  stmt.bind(params);
  stmt.step();
  stmt.free();
  saveDatabase();
  
  return getById(id);
}

function remove(id) {
  const stmt = db.prepare('DELETE FROM repositories WHERE id = ?');
  stmt.bind([id]);
  stmt.step();
  stmt.free();
  saveDatabase();
  return true;
}

module.exports = {
  initDatabase,
  getAll,
  getById,
  create,
  update,
  remove,
  existsByUsernameAndRepo,
  getTotalCount
};

