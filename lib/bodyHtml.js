const fs = require('fs');
const path = require('path');

// Lê o markup original (extraído do protótipo) uma única vez em build/runtime
function getBodyHtml() {
  return fs.readFileSync(path.join(process.cwd(), 'lib', 'body.html'), 'utf8');
}

module.exports = { getBodyHtml };
