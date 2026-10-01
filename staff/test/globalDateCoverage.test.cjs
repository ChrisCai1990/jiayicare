const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { parse } = require('@babel/parser')
const traverse = require('@babel/traverse').default

test('both web applications route every static and dynamic date input through the shared field', () => {
  const root = path.resolve(__dirname, '../..')
  const missing = []
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) { visit(file); continue }
      if (!/\.[jt]sx?$/.test(file)) continue
      const source = fs.readFileSync(file, 'utf8')
      traverse(parse(source, { sourceType: 'module', plugins: ['jsx'] }), {
        JSXOpeningElement({ node }) {
          if (node.name.name !== 'input') return
          const type = node.attributes.find(attr => attr.name?.name === 'type')
          if ((type && (type.value?.type !== 'StringLiteral' || ['date', 'datetime-local'].includes(type.value.value))) ||
            (!type && node.attributes.some(attr => attr.type === 'JSXSpreadAttribute'))) missing.push(file)
        },
      })
    }
  }
  for (const app of ['staff', 'admin']) {
    visit(path.join(root, app, 'src'))
    assert.doesNotMatch(fs.readFileSync(path.join(root, app, 'src/main.jsx'), 'utf8'), /installContinuousDateTyping/)
  }
  assert.deepEqual(missing, [])
})
