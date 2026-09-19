const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const babel = require('@babel/core');
const source = fs.readFileSync(require.resolve('../src/pages/profile/invite/index.jsx'), 'utf8');
for (const directEntry of [false, true]) test(`invite back returns safely (direct entry: ${directEntry})`, async () => {
  const calls = [];
  const Taro = { useDidShow() {}, useShareAppMessage() {},
    navigateBack: async () => { calls.push('back'); if (directEntry) throw Error('no previous page'); },
    switchTab: async ({ url }) => calls.push(url) };
  const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }), useState: x => [x, () => {}] };
  const mocks = { react: React, '@tarojs/taro': Taro, '@tarojs/components': { View: 'View', Text: 'Text', Button: 'Button' },
    '../../../context/AuthContext': { useAuth: () => ({ user: {} }) }, '../../../services/api': {},
    '../../../theme': { colors: {}, radius: {}, spacing: {} }, '../../../hooks/useNavBar': () => ({ statusBarHeight: 24, navBarHeight: 44 }) };
  const code = babel.transformSync(source, { configFile: false, babelrc: false, presets: [require.resolve('@babel/preset-react')], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
  const ctx = { exports: {}, require: name => mocks[name] || '' }; vm.runInNewContext(code, ctx);
  const nodes = []; const walk = node => { if (!node || typeof node !== 'object') return; nodes.push(node); node.children.flat(Infinity).forEach(walk); };
  walk(ctx.exports.default()); const button = nodes.find(n => n.props.ariaLabel === '返回');
  assert.ok(button); await button.props.onClick();
  assert.deepEqual(calls, directEntry ? ['back', '/pages/profile/index/index'] : ['back']);
  assert.ok(nodes.find(n => n.props.openType === 'share'), 'share entry remains');
});
