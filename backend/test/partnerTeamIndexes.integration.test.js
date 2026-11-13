const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');
const mongoose = require('mongoose');

test('new accounting indexes can be audited and applied to empty collections',
  { skip: !process.env.TEST_MONGOD, timeout: 60000 }, async t => {
    const dbpath = mkdtempSync(path.join(tmpdir(), 'partner-team-indexes-'));
    const server = net.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    const mongod = spawn(process.env.TEST_MONGOD, ['--dbpath', dbpath,
      '--bind_ip', '127.0.0.1', '--port', String(port)],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(async () => {
      await mongoose.disconnect();
      mongod.kill();
      await new Promise(resolve => mongod.once('exit', resolve));
      rmSync(dbpath, { recursive: true, force: true });
    });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('mongod startup timeout')), 15000);
      mongod.once('error', reject);
      mongod.stdout.on('data', chunk => {
        if (String(chunk).includes('Waiting for connections')) { clearTimeout(timeout); resolve(); }
      });
      mongod.stderr.resume();
    });
    const uri = `mongodb://127.0.0.1:${port}/partner_team_index_test`;
    const script = path.join(__dirname, '../src/scripts/preparePartnerTeamIndexes.js');
    const run = (...args) => execFileSync(process.execPath, [script, ...args],
      { env: { ...process.env, MONGODB_URI: uri }, encoding: 'utf8' });
    const before = run();
    assert.match(before, /partnerteamrelations: documents=0, missingIndexes=[1-9]/);
    assert.match(before, /partnerteams: documents=0, missingIndexes=[1-9]/);
    assert.match(before, /marketpartnerliaisons: documents=0, missingIndexes=[1-9]/);
    run('--apply');
    const after = run();
    assert.match(after, /partnerteamrelations: documents=0, missingIndexes=0/);
    assert.match(after, /partnerteams: documents=0, missingIndexes=0/);
    assert.match(after, /marketpartnerliaisons: documents=0, missingIndexes=0/);
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
    const indexes = await mongoose.connection.db.collection('partnerteamrelations').listIndexes().toArray();
    assert.ok(indexes.some(row => row.unique && row.partialFilterExpression?.effectiveUntil === null));
  });
