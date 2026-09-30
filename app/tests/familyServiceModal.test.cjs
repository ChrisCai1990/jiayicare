const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('esbuild');
function harness() {
  const states = [], deps = [], pending = [], effects = [], cleanups = [];
  let index = 0, writes = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState(initial) { const i = index++; if (!(i in states)) states[i] = initial; return [states[i], v => { writes++; states[i] = typeof v === 'function' ? v(states[i]) : v; }]; },
    useEffect(fn, next) { const i = index++; if (!deps[i] || next.some((v, j) => v !== deps[i][j])) { deps[i] = next; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn(); }); } },
  };
  const ctx = { module: { exports: {} }, require: name => {
    if (name === 'react') return React;
    if (name === 'react-native') return { StyleSheet: { create: x => x } };
    if (name.endsWith('/api')) return { familyLinksAPI: { serviceOverview: id => new Promise((resolve, reject) => pending.push({ id, resolve, reject })) } };
    return { colors: {}, spacing: {}, radius: {} };
  } };
  vm.runInNewContext(transformSync(fs.readFileSync(path.join(__dirname, '../src/screens/profile/FamilyServiceModal.js'), 'utf8'), { loader: 'jsx', format: 'cjs' }).code, ctx);
  return {
    render(id = 'A') { index = 0; const tree = ctx.module.exports.default({ memberId: id, onClose() {} }); effects.splice(0).forEach(fn => fn()); return tree; },
    unmount() { cleanups.forEach(fn => fn?.()); }, pending, writes: () => writes,
  };
}
const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : tree && typeof tree === 'object' ? (tree.children || []).flat(Infinity).map(text).join('') : '';
const nodes = tree => tree && typeof tree === 'object' ? [tree, ...(tree.children || []).flat(Infinity).flatMap(nodes)] : [];
const flush = () => new Promise(resolve => setImmediate(resolve));
const result = id => ({ success: true, data: { member: { _id: id, name: `成员${id}` }, service: { activeCount: 1, latestServiceName: '服务示例' }, appointments: [], medicalHistory: 'PRIVATE_SENTINEL' } });

test('overview displays allowed fields and an explicit empty schedule', async () => {
  const h = harness(); h.render(); assert.equal(h.pending[0].id, 'A');
  h.pending[0].resolve(result('A')); await flush();
  const value = text(h.render());
  assert.ok(value.includes('成员A')); assert.ok(value.includes('暂无预约安排')); assert.ok(!value.includes('PRIVATE_SENTINEL'));
});
test('denied request stays empty and retry uses the current member', async () => {
  const h = harness(); h.render(); h.pending[0].reject(Error('未建立有效的双向家庭关联')); await flush();
  let tree = h.render(); assert.ok(text(tree).includes('未建立有效')); assert.ok(!text(tree).includes('服务示例'));
  nodes(tree).find(n => n.props.onPress && text(n) === '重试').props.onPress(); h.render();
  assert.equal(h.pending[1].id, 'A'); h.pending[1].resolve(result('A')); await flush(); assert.ok(text(h.render()).includes('成员A'));
});
test('member changes discard late responses and unmount prevents later state writes', async () => {
  const h = harness(); h.render('A'); h.render('B');
  h.pending[1].resolve(result('B')); await flush(); h.pending[0].resolve(result('A')); await flush();
  assert.ok(text(h.render('B')).includes('成员B')); assert.ok(!text(h.render('B')).includes('成员A'));
  h.render('C'); h.unmount(); const before = h.writes(); h.pending[2].resolve(result('C')); await flush(); assert.equal(h.writes(), before);
});
test('wrong member response never displays its details', async () => {
  const h = harness(); h.render('A'); h.pending[0].resolve(result('B')); await flush();
  const value = text(h.render('A')); assert.ok(value.includes('暂时不可用')); assert.ok(!value.includes('成员B'));
});
