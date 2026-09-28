const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('actual built React and reconciler initialize together', () => {
  const wx = { webpackJsonp: [] };
  const context = vm.createContext({ wx, console, setTimeout, clearTimeout, performance, require() {} });
  const dist = path.join(__dirname, '../dist');
  for (const file of ['common.js', 'vendors.js', 'taro.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(dist, file), 'utf8'), context, { filename: file });
  }
  // Register app-owned Babel helpers, but do not invoke wx App or production APIs.
  for (const chunk of wx.webpackJsonp) chunk[2] = undefined;
  const modules = Object.assign({}, ...wx.webpackJsonp.map(chunk => chunk[1]));
  const reactId = Object.keys(modules).find(id => /\.version=/.test(String(modules[id])) && /useState/.test(String(modules[id])));
  const rendererId = Object.keys(modules).find(id => id !== reactId && /ReactCurrentOwner/.test(String(modules[id])) && /ReactCurrentDispatcher/.test(String(modules[id])));
  assert.ok(reactId, 'React module must exist in the artifact');
  assert.ok(rendererId, 'Reconciler module must exist in the artifact');
  vm.runInContext(fs.readFileSync(path.join(dist, 'runtime.js'), 'utf8'), context);
  let checked = false;
  wx.webpackJsonp.push([[999999], {}, require => {
    const react = require(reactId);
    assert.equal(react.version, '18.2.0');
    assert.ok(react.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentOwner);
    const renderer = require(rendererId)({});
    assert.equal(typeof renderer.createContainer, 'function');
    checked = true;
  }]);
  assert.ok(checked, 'Built runtime must execute the initialization check');
});
