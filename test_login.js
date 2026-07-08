const Database = require('C:\\Users\\Cloud\\Desktop\\B78B~1\\backend\\node_modules\\better-sqlite3');
const bcrypt = require('C:\\Users\\Cloud\\Desktop\\B78B~1\\backend\\node_modules\\bcryptjs');
const db = new Database('C:\\Users\\Cloud\\Desktop\\B78B~1\\backend\\data\\accounting.db');

const username = 'admin';
const password = 'admin123';

try {
  // Test the lockout query
  const lockout = db.prepare(`
    SELECT COUNT(*) as attempts, MAX(created_at) as last_attempt
    FROM login_attempts WHERE username = ? AND created_at > datetime('now', '-15 minutes')
  `).get(username);
  console.log('Lockout check:', JSON.stringify(lockout));

  // Get user
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
  console.log('User found:', !!user);
  
  if (user) {
    const valid = bcrypt.compareSync(password, user.password_hash);
    console.log('Password valid:', valid);
    
    const token = require('C:\\Users\\Cloud\\Desktop\\B78B~1\\backend\\dist\\config\\auth.js').generateToken({ id: user.id, role: user.role });
    console.log('Token generated:', token.substring(0, 30) + '...');
    
    const refreshToken = require('C:\\Users\\Cloud\\Desktop\\B78B~1\\backend\\dist\\config\\auth.js').generateRefreshToken(user.id);
    console.log('Refresh token generated:', refreshToken.substring(0, 30) + '...');
  }
} catch(e) {
  console.log('ERROR:', e.message);
  console.log('Stack:', e.stack);
}
