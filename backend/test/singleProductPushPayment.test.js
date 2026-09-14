const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readRoute = name => fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', name), 'utf8');

test('single-product staff pushes persist the canonical products array', () => {
  const source = readRoute('staff.js');
  assert.match(source, /const productItem = \{/);
  assert.match(source, /products: \[productItem\]/);
});

test('push-record payment accepts legacy records that only contain productId', () => {
  const source = readRoute('user.js');
  assert.match(source, /record\.products\?\.length \? record\.products : \(record\.productId/);
  assert.match(source, /new Set\(selectedProductIds\.map\(String\)\)/);
  assert.match(source, /selectedIdSet\.has\(String\(p\.productId\)\)/);
});
