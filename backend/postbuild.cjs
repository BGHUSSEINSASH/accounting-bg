const fs = require('fs');
const path = require('path');

// Find pglite dist directory
let pgliteDistDir;
try {
  const pgliteMain = require.resolve('@electric-sql/pglite');
  pgliteDistDir = path.dirname(pgliteMain);
} catch (e) {
  pgliteDistDir = path.join(__dirname, 'node_modules', '@electric-sql', 'pglite', 'dist');
}

const filesToCopy = ['pglite.data', 'pglite.wasm', 'initdb.wasm'];

for (const file of filesToCopy) {
  const src = path.join(pgliteDistDir, file);
  if (!fs.existsSync(src)) {
    console.warn(file, 'not found at', src);
    continue;
  }
  const size = fs.statSync(src).size;
  console.log(`${file} found at ${src} (${(size/1024/1024).toFixed(1)}MB)`);
  
  // Copy to project root (-> /var/task/{file} on Vercel) and dist/
  const targets = [
    path.join(__dirname, file),
    path.join(__dirname, 'dist', file),
  ];
  for (const target of targets) {
    try {
      fs.copyFileSync(src, target);
      console.log('  Copied to', target);
    } catch (e) {
      console.warn('  Failed to copy to', target, ':', e.message);
    }
  }
}
