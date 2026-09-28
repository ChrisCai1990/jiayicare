const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const acorn = require('acorn');

test('built shared chunk contains no unsupported optional chaining or nullish syntax', () => {
  const file = path.join(__dirname, '../dist/common.js');
  assert.ok(fs.existsSync(file), 'Build the mini program before checking its artifact');
  assert.doesNotThrow(() => acorn.parse(fs.readFileSync(file, 'utf8'), { ecmaVersion: 2019 }),
    'Shared modules must be transpiled before uploading to WeChat');
});
