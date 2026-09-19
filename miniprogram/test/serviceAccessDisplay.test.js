const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const root = path.join(__dirname, '../..');
test('两个客户端的服务展示消费后端核验结果且 JSX 可编译', () => {
  for (const file of ['app/src/screens/profile/ProfileScreen.js', 'app/src/screens/services/RenewalScreen.js', 'app/src/screens/services/ServiceMallScreen.js', 'miniprogram/src/pages/profile/index/index.jsx']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(source, /serviceAccess/);
    assert.doesNotThrow(() => babel.transformSync(source, { configFile: false, babelrc: false, presets: [require.resolve('@babel/preset-react')], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }));
  }
});
test('客户自助档案不再写入服务包或服务期', () => {
  const source = fs.readFileSync(path.join(root, 'backend/src/routes/user.js'), 'utf8');
  const handler = source.slice(source.indexOf("router.put('/me'"), source.indexOf("router.put('/me'") + 6000);
  assert.doesNotMatch(handler, /updateData\.(?:servicePackage|serviceExpiry)\s*=/);
});
