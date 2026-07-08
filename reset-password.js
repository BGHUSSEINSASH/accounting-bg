const path = require('path');
const bcrypt = require(path.join(__dirname, 'backend', 'node_modules', 'bcryptjs'));
const hash = bcrypt.hashSync('admin123', 10);
console.log(hash);
