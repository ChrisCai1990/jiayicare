const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const babel = require('@babel/core');
const base = path.dirname(require.resolve('babel-preset-taro/package.json'));
const code = babel.transformSync(fs.readFileSync(path.join(__dirname, '../src/components/CheckinFavorites.jsx'), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'].map(name => require.resolve(name, { paths: [base] })),
}).code;

function harness(initial = {}) {
  const storage = new Map(Object.entries(initial)), state = [], deps = [], effects = [];
  let cursor = 0, effectCursor = 0, dirty = false, tree, failWrite = false;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState(value) { const i = cursor++; if (!(i in state)) state[i] = value; return [state[i], next => { state[i] = typeof next === 'function' ? next(state[i]) : next; dirty = true; }]; },
    useEffect(fn, next) { const i = effectCursor++; if (!deps[i] || next.some((v, n) => v !== deps[i][n])) { deps[i] = next; effects.push(fn); } },
  };
  const props = { userId: 'a', items: [{ key: 'weight', label: '体重' }, { key: 'water', label: '饮水' }], renderItem: item => React.createElement('item', { key: item.key }, item.label), children: 'ORIGINAL_RECORD_UI', onBatch() {} };
  const ctx = { exports: {}, require(name) {
    if (name === 'react') return React;
    if (name === '@tarojs/components') return { View: 'View', Text: 'Text', ScrollView: 'ScrollView' };
    if (name === '@tarojs/taro') return { getStorageSync: key => storage.get(key), setStorageSync(key, value) { if (failWrite) throw Error('full'); storage.set(key, value); }, removeStorageSync(key) { if (failWrite) throw Error('full'); storage.delete(key); } };
    if (name === '../theme') return { colors: {}, radius: {} };
    if (name === '../i18n') return { useLanguage: () => ({ t: s => s }) };
    throw Error(name);
  } };
  vm.runInNewContext(code, ctx);
  const render = () => { do { dirty = false; cursor = effectCursor = 0; tree = ctx.exports.default(props); while (effects.length) effects.shift()(); } while (dirty); };
  const nodes = root => root && typeof root === 'object' ? [root, ...root.children.flatMap(nodes)] : [];
  const text = root => typeof root === 'string' ? root : root && typeof root === 'object' ? root.children.map(text).join('') : '';
  const click = label => { const matches = nodes(tree).filter(n => n.props.onClick && text(n) === label); assert.ok(matches.length, `clickable ${label}`); matches[matches.length - 1].props.onClick({ stopPropagation() {} }); render(); };
  render();
  return { storage, click, text: () => text(tree), switchUser(id) { props.userId = id; render(); }, failWrites() { failWrite = true; } };
}

test('default and cancelled edits preserve all original record UI', () => {
  const h = harness(); assert.match(h.text(), /ORIGINAL_RECORD_UI/);
  h.click('管理常用'); h.click('饮水✓'); h.click('取消');
  assert.match(h.text(), /ORIGINAL_RECORD_UI/); assert.equal(h.storage.size, 0);
});
test('saved favorites retain all-project and batch entry; restore returns original UI', () => {
  const h = harness(); h.click('管理常用'); h.click('饮水✓'); h.click('保存设置');
  assert.doesNotMatch(h.text(), /ORIGINAL_RECORD_UI/); assert.match(h.text(), /体重/); assert.match(h.text(), /多日快速补录/);
  h.click('全部项目'); assert.match(h.text(), /ORIGINAL_RECORD_UI/);
  h.click('管理常用'); h.click('恢复全部展示'); assert.match(h.text(), /ORIGINAL_RECORD_UI/); assert.equal(h.storage.size, 0);
});
test('preferences survive reopening, stay account scoped and discard obsolete keys', () => {
  const h = harness({ 'jy_checkin_favorites_v1:a': ['weight', 'removed'] });
  assert.doesNotMatch(h.text(), /ORIGINAL_RECORD_UI/); h.switchUser('b'); assert.match(h.text(), /ORIGINAL_RECORD_UI/);
  h.switchUser('a'); assert.doesNotMatch(h.text(), /ORIGINAL_RECORD_UI/);
});
test('empty selection restores default; malformed cache never hides projects', () => {
  const h = harness({ 'jy_checkin_favorites_v1:a': 'broken' }); assert.match(h.text(), /ORIGINAL_RECORD_UI/);
  h.click('管理常用'); h.click('体重✓'); h.click('饮水✓'); h.click('保存设置'); assert.match(h.text(), /ORIGINAL_RECORD_UI/);
});
test('storage failure keeps editor open and original preference unchanged', () => {
  const h = harness(); h.click('管理常用'); h.click('饮水✓'); h.failWrites(); h.click('保存设置');
  assert.match(h.text(), /设置未保存，请重试/); assert.match(h.text(), /ORIGINAL_RECORD_UI/); assert.equal(h.storage.size, 0);
});
