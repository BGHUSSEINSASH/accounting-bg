const Database = require('C:\\Users\\Cloud\\Desktop\\B78B~1\\backend\\node_modules\\better-sqlite3');
const db = new Database('C:\\Users\\Cloud\\Desktop\\B78B~1\\backend\\data\\accounting.db');
db.prepare('DELETE FROM login_attempts').run();
console.log('Login attempts cleared');
