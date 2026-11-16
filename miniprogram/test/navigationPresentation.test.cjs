const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');
const base = path.dirname(require.resolve('babel-preset-taro/package.json'));
function load(file, mocks) {
  const source = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
  const code = babel.transformSync(source, { configFile: false, babelrc: false,
    plugins: ['@babel/plugin-transform-react-jsx', '@babel/plugin-transform-modules-commonjs'].map(n => require.resolve(n, { paths: [base] })) }).code;
  const ctx = { exports: {}, require: name => { assert.ok(name in mocks, name); return mocks[name]; } };
  vm.runInNewContext(code, ctx); return ctx.exports.default;
}
test('native back button stops the page tap and invokes custom action once', () => {
  const calls = [];
  const Back = load('components/BackButton.jsx', {
    react: { createElement: (type, props, ...children) => ({ type, props, children }) },
    '@tarojs/components': { Button: 'native-button', Navigator: 'native-navigator', Text: 'text' }, '@tarojs/taro': {},
    './Icon': () => null, '../theme': { colors: {} }, '../i18n': { useLanguage: () => ({ t: s => s }) },
    '../utils/returnToPrevious': { returnToPrevious: () => calls.push('default') },
  });
  const node = Back({ onClick: () => calls.push('custom') });
  assert.equal(node.type, 'native-button');
  assert.equal(node.props.style.width, '72px');
  assert.equal(node.props.style.flex, '0 0 72px');
  node.props.onClick({ stopPropagation: () => calls.push('stop') });
  assert.deepEqual(calls, ['stop', 'custom']);
  Back({}).props.onClick({ stopPropagation() {} }); assert.equal(calls.at(-1), 'default');
  const link = Back({ destination: '/pages/chat/index' });
  assert.equal(link.type, 'native-navigator');
  assert.equal(link.props.openType, 'switchTab');
  assert.equal(link.props.url, '/pages/chat/index');
  assert.equal(link.props.onClick, undefined);
});
test('safe-area measurements are available on the first render, including unavailable capsule', () => {
  for (const menu of [{ top: 60, bottom: 92 }, null]) {
    const hook = load('hooks/useNavBar.js', { react: { useState: init => [init()] }, '@tarojs/taro': {
      getWindowInfo: () => ({ statusBarHeight: 54 }), getMenuButtonBoundingClientRect: () => menu,
    } });
    const result = hook(); assert.equal(result.statusBarHeight, 54); assert.equal(result.navBarHeight, 44); assert.equal(result.totalHeight, 98);
  }
});
test('stale group id on a visible list cannot swallow the back action', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/pages/messages/service-group/index.jsx'), 'utf8');
  const line = source.split('\n').find(s => s.trim().startsWith('const back ='));
  const events = [], selectedId = { current: 'stale-id' };
  vm.runInNewContext(line + ';back();', { group: null, selectedId, Taro: {}, returnToPrevious: (_, options) => events.push(options.destination) });
  assert.deepEqual(events, ['/pages/chat/index']); assert.equal(selectedId.current, '');
});
