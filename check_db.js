const Database = require('C:\\Users\\Cloud\\Desktop\\B78B~1\\backend\\node_modules\\better-sqlite3');
const db = new Database('C:\\Users\\Cloud\\Desktop\\B78B~1\\backend\\data\\accounting.db');
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('Tables:', tables.map(t => t.name).join(', '));

try {
  const r = db.prepare("SELECT COUNT(*) as cnt FROM login_attempts").get();
  console.log('login_attempts exists, count:', r.cnt);
} catch(e) {
  console.log('login_attempts ERROR:', e.message);
}

try {
  const r2 = db.prepare("SELECT COUNT(*) as cnt FROM refresh_tokens").get();
  console.log('refresh_tokens exists, count:', r2.cnt);
} catch(e) {
  console.log('refresh_tokens ERROR:', e.message);
}

console.log('DB check done');
