// Local acceptance harness only. Never imported by the production application.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');

async function main() {
  if (process.env.RUN_ISOLATED_ACCEPTANCE !== 'true') throw new Error('Explicit RUN_ISOLATED_ACCEPTANCE=true required');
  // Discard inherited service credentials, proxies and runtime injection options.
  const keep = new Set(['SYSTEMROOT', 'WINDIR', 'PATH', 'TEMP', 'TMP', 'NODE_PATH']);
  for (const key of Object.keys(process.env)) if (!keep.has(key.toUpperCase())) delete process.env[key];
  const session = crypto.randomUUID().replace(/-/g, '');
  const runtime = fs.mkdtempSync(path.join(os.tmpdir(), 'jiayicare-acceptance-'));
  const database = `jiayicare_acceptance_${session}`;
  Object.assign(process.env, {
    NODE_ENV: 'test', PORT: '3000', JWT_SECRET: crypto.randomBytes(48).toString('hex'),
    MONGODB_URI: `mongodb://127.0.0.1:27134/${database}`,
    STARTUP_SCHEMA_WRITES_ENABLED: 'false', STARTUP_BACKGROUND_JOBS_ENABLED: 'false',
    UPLOADS_DIR: path.join(runtime, 'uploads'), CHECKUP_PREPARATION_AUTO_ENABLED: 'true',
  });
  require('dotenv').config = () => ({ parsed: {} });
  installNetworkFence();
  const mongoose = require('mongoose');
  mongoose.set('autoIndex', false);
  mongoose.set('autoCreate', false);
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 3000 });
  const build = await mongoose.connection.db.admin().command({ buildInfo: 1 });
  if (build.version !== '7.0.34') throw new Error('Acceptance requires MongoDB 7.0.34');
  const Admin = require('../../src/models/Admin');
  const User = require('../../src/models/User');
  const accounts = [];
  const assignment = {};
  for (const [role, field] of [['familyDoctor', 'assignedFamilyDoctor'], ['healthPlanner', 'assignedHealthPlanner'], ['healthManager', 'assignedHealthManager'], ['medicalAssistant', null], ['superadmin', null]]) {
    const password = crypto.randomBytes(18).toString('base64url');
    const username = `acceptance_${role}`;
    const row = await Admin.create({ username, password, name: `隔离验收-${role}`, role });
    accounts.push({ username, password, role, id: String(row._id) });
    if (field) assignment[field] = row._id;
  }
  const patient = await User.create({ name: '隔离验收客户（纯虚构）', ...assignment,
    serviceStartDate: new Date().toISOString().slice(0, 10), serviceExpiry: '2027-12-31', onboardingCompleted: true });
  const manifest = { database, runtime, api: 'http://127.0.0.1:3000/api', patientId: String(patient._id), accounts,
    boundary: 'Synthetic local data; external network blocked; no real AI/payment/notification validation.' };
  fs.writeFileSync(path.join(runtime, 'session.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(`ISOLATED_ACCEPTANCE_SESSION=${path.join(runtime, 'session.json')}`);
  // Backend connection reuses this exact URI. No .env is loaded.
  require('../../src/index');
}

function installNetworkFence() {
  const blocked = () => { throw new Error('ISOLATED_ACCEPTANCE_EXTERNAL_IO_BLOCKED'); };
  for (const name of ['node:http', 'node:https']) {
    const module = require(name);
    module.request = blocked;
    module.get = blocked;
  }
  global.fetch = blocked;
  const net = require('node:net');
  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const options = Array.isArray(args[0]) ? args[0][0] : args[0];
    if (!options || typeof options !== 'object' || options.host !== '127.0.0.1' || Number(options.port) !== 27134) return blocked();
    return originalConnect.apply(this, args);
  };
  const originalListen = net.Server.prototype.listen;
  net.Server.prototype.listen = function (...args) {
    if (Number(args[0]) !== 3000) return blocked();
    return originalListen.call(this, 3000, '127.0.0.1', ...args.slice(1));
  };
  const child = require('node:child_process');
  for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) child[key] = blocked;
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exit(1); });
module.exports = { installNetworkFence };
