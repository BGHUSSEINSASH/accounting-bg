const path = require('path');
const Database = require(path.join(__dirname, 'backend', 'node_modules', 'better-sqlite3'));
const bcrypt = require(path.join(__dirname, 'backend', 'node_modules', 'bcryptjs'));

const dbPath = path.join(__dirname, 'backend', 'data', 'accounting.db');
const db = new Database(dbPath);

// Delete existing admin user and re-insert with correct hash
const hash = bcrypt.hashSync('admin123', 10);
db.prepare('DELETE FROM users WHERE username = ?').run('admin');
db.prepare(`INSERT INTO users (username, password_hash, full_name, email, phone, role, department)
  VALUES (?, ?, ?, ?, ?, ?, ?)`).run('admin', hash, 'مدير النظام', 'admin@system.com', '0500000000', 'admin', 'admin');

const user = db.prepare('SELECT id, username, role FROM users WHERE username = ?').get('admin');
console.log('Admin user created:', JSON.stringify(user));

// Verify
const check = bcrypt.compareSync('admin123', user.password_hash);
console.log('Password verification:', check);

db.close();
