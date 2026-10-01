const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');

function render(os, browser, loading = false) {
  const React = { createElement: (type, props, ...children) => ({type, props, children}), Fragment: 'fragment' };
  const navigator = () => ({Navigator: 'Navigator', Screen: 'Screen'});
  const context = {module: {exports: {}}, window: browser, URLSearchParams, require: name => {
    if (name === 'react') return React;
    if (name === 'react-native') return {Platform: {OS: os}, View: 'View', ActivityIndicator: 'ActivityIndicator'};
    if (name === '@react-navigation/native') return {NavigationContainer: 'NavigationContainer'};
    if (name === '@react-navigation/native-stack') return {createNativeStackNavigator: navigator};
    if (name === '@react-navigation/bottom-tabs') return {createBottomTabNavigator: navigator};
    if (name.includes('AuthContext')) return {useAuth: () => ({loading, token: null, user: null})};
    if (name.includes('theme')) return {colors: {}};
    return {};
  }};
  const code = fs.readFileSync(path.join(__dirname, '../src/navigation/index.js'), 'utf8');
  vm.runInNewContext(transformSync(code, {loader: 'jsx', format: 'cjs'}).code, context);
  return context.module.exports.default();
}
for (const os of ['android', 'ios']) {
  test(`${os} starts when window exists without browser location`, () => {
    assert.equal(render(os, {}, true).type, 'View');
    assert.equal(render(os, {}).type, 'NavigationContainer');
  });
}
test('web shared report routing remains available', () => {
  const tree = render('web', {location: {search: '?share=sample-token'}});
  const route = tree.children[0].children[0];
  assert.equal(route.props.name, 'PublicReport');
  assert.equal(route.props.initialParams.token, 'sample-token');
});
