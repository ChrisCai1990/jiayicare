// Opt-in test harness: no production imports; one exact external inference destination.
const { AsyncLocalStorage } = require('node:async_hooks');
function install() {
  const context = new AsyncLocalStorage();
  const blocked = () => { throw new Error('LIVE_ACCEPTANCE_EXTERNAL_IO_BLOCKED'); };
  const https = require('node:https'), http = require('node:http'), net = require('node:net');
  const request = https.request, connect = net.Socket.prototype.connect, listen = net.Server.prototype.listen;
  let calls = 0, active = false;
  https.request = (options, callback) => {
    if (!options || options.hostname !== 'dashscope.aliyuncs.com' || options.path !== '/compatible-mode/v1/chat/completions'
      || options.method !== 'POST' || (options.port && Number(options.port) !== 443) || options.agent || options.createConnection
      || active || calls >= 6) return blocked();
    calls++; active = true;
    const req = context.run(true, () => request({ ...options, agent: false }, callback));
    req.once('close', () => { active = false; });
    console.log('LIVE_QWEN_REQUEST', calls);
    return req;
  };
  http.request = http.get = https.get = global.fetch = blocked;
  net.Socket.prototype.connect = function (...args) {
    const o = Array.isArray(args[0]) ? args[0][0] : args[0];
    const local = o && o.host === '127.0.0.1' && Number(o.port) === 27134;
    const ai = context.getStore() && o && o.host === 'dashscope.aliyuncs.com' && Number(o.port) === 443;
    if (!local && !ai) return blocked();
    return connect.apply(this, args);
  };
  net.Server.prototype.listen = function (...args) {
    if (Number(args[0]) !== 3002) return blocked();
    return listen.call(this, 3002, '127.0.0.1', ...args.slice(1));
  };
  const child = require('node:child_process');
  for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) child[name] = blocked;
}
module.exports = { install };
