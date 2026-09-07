const fs = require('fs');
const path = require('path');

// Find pglite dist directory using package.json location
let pgliteDistDir;
try {
  const pglitePkg = require.resolve('@electric-sql/pglite/package.json');
  pgliteDistDir = path.join(path.dirname(pglitePkg), 'dist');
} catch (e) {
  // Try direct path
  pgliteDistDir = path.join(__dirname, 'node_modules', '@electric-sql', 'pglite', 'dist');
}

const src = path.join(pgliteDistDir, 'pglite.data');

if (!fs.existsSync(src)) {
  console.warn('pglite.data not found at', src, '- skipping copy');
  process.exit(0);
}

console.log('pglite.data found at', src, `(${(fs.statSync(src).size/1024/1024).toFixed(1)}MB)`);

// Copy to multiple locations to ensure it's found by Vercel serverless
const targets = [
  path.join(__dirname, 'pglite.data'),           // project root -> /var/task/pglite.data
  path.join(__dirname, 'dist', 'pglite.data'),   // dist folder
];

for (const target of targets) {
  try {
    fs.copyFileSync(src, target);
    console.log('Copied pglite.data to', target);
  } catch (e) {
    console.warn('Failed to copy to', target, ':', e.message);
  }
}
