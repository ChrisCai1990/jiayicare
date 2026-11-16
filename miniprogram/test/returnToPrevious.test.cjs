const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '../src/utils/returnToPrevious.js'), 'utf8').replace('export async function', 'async function');
const back = vm.runInNewContext(src + '; returnToPrevious');
function fixture(count, failures = []) {
  const events = [];
  const call = name => async args => { events.push([name, args]); if (failures.includes(name)) throw Error(name); };
  return { events, taro: { getCurrentPages: () => Array(count).fill({}), navigateBack: call('back'), switchTab: call('home'), reLaunch: call('relaunch'), showToast: call('error') } };
}
test('normal page returns to its real previous page', async () => { const f = fixture(2); await back(f.taro); assert.deepEqual(f.events.map(e => e[0]), ['back']); });
test('service group list always returns to health manager even with a stale page stack', async () => {
  const f = fixture(4); await back(f.taro, { destination: '/pages/chat/index' });
  assert.equal(f.events.length, 1); assert.equal(f.events[0][0], 'home'); assert.equal(f.events[0][1].url, '/pages/chat/index');
});
test('direct entry and failed pop both fall back to home', async () => {
  for (const [count, failures] of [[1, []], [2, ['back']]]) { const f = fixture(count, failures); await back(f.taro); assert.equal(f.events.at(-1)[0], 'home'); assert.equal(f.events.at(-1)[1].url, '/pages/home/index'); }
});
test('failed tab switch relaunches home; total failure is visible', async () => {
  const f = fixture(1, ['home']); await back(f.taro); assert.equal(f.events.at(-1)[0], 'relaunch');
  const g = fixture(1, ['home', 'relaunch']); await back(g.taro); assert.equal(g.events.at(-1)[0], 'error');
});
