const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const mongoose = require('mongoose');
const express = require('express');
const jwt = require('jsonwebtoken');
const FollowUp = require('../src/models/FollowUp');
const PushRecord = require('../src/models/PushRecord');
const { tenantContext } = require('../src/utils/tenantScope');

const base = process.env.TENANT_ISOLATION_TEST_MONGO;
test('isolated Mongo: two institutions cannot read or update each other’s care records', { skip: !base }, async () => {
  assert.match(base, /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/?$/);
  const dbName = `jiayicare_tenant_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(`${base.replace(/\/$/, '')}/${dbName}`, { autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db;
  const a = new mongoose.Types.ObjectId();
  const b = new mongoose.Types.ObjectId();
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();
  const staffA = new mongoose.Types.ObjectId();
  const staffB = new mongoose.Types.ObjectId();
  const withTenant = (tenantId, id, fn) => new Promise((resolve, reject) =>
    tenantContext({ staff: { _id: id, role: 'familyDoctor', tenantId } }, {}, () => Promise.resolve().then(fn).then(resolve, reject)));
  try {
    await db.collection('tenants').insertMany([
      { _id: a, code: 'synthetic-a', status: 'active' },
      { _id: b, code: 'synthetic-b', status: 'active' },
    ]);
    await db.collection('admins').insertMany([
      { _id: staffA, tenantId: a, role: 'familyDoctor', name: 'A' },
      { _id: staffB, tenantId: b, role: 'familyDoctor', name: 'B' },
    ]);
    await db.collection('users').insertMany([
      { _id: userA, tenantId: a, phone: 'synthetic-a' },
      { _id: userB, tenantId: b, phone: 'synthetic-b' },
    ]);
    await db.collection('followups').insertMany([
      { tenantId: a, patientId: userA, staffId: staffA, assignedTo: staffA, theme: 'A' },
      { tenantId: b, patientId: userB, staffId: staffB, assignedTo: staffB, theme: 'B' },
    ]);
    await db.collection('pushrecords').insertMany([
      { tenantId: a, patientId: userA, staffId: staffA, type: 'knowledge', title: 'A' },
      { tenantId: b, patientId: userB, staffId: staffB, type: 'knowledge', title: 'B' },
    ]);
    await withTenant(a, staffA, async () => {
      assert.deepEqual((await FollowUp.find({}).lean()).map(row => row.theme), ['A']);
      assert.deepEqual((await PushRecord.find({}).lean()).map(row => row.title), ['A']);
      assert.equal(await FollowUp.findOne({ patientId: userB }), null);
      assert.equal(await PushRecord.findOne({ patientId: userB }), null);
      assert.equal((await FollowUp.updateOne({ patientId: userB }, { $set: { theme: 'changed' } })).matchedCount, 0);
      assert.equal((await PushRecord.updateOne({ patientId: userB }, { $set: { title: 'changed' } })).matchedCount, 0);
      await assert.rejects(FollowUp.create({ patientId: userB, staffId: staffA, theme: 'cross' }), /其他机构客户/);
      await assert.rejects(PushRecord.insertMany([{ patientId: userB, staffId: staffA, type: 'knowledge' }]), /其他机构客户/);
      const ownTask = await FollowUp.create({ patientId: userA, staffId: staffA, theme: 'own' });
      const [ownPush] = await PushRecord.insertMany([{ patientId: userA, staffId: staffA, type: 'knowledge' }]);
      const upserted = await FollowUp.findOneAndUpdate(
        { patientId: userA, sourceScheduleKey: 'synthetic-upsert' },
        { $set: { patientId: userA, staffId: staffA, theme: 'upsert' } },
        { upsert: true, new: true }
      );
      assert.equal(String(ownTask.tenantId), String(a));
      assert.equal(String(ownPush.tenantId), String(a));
      assert.equal(String(upserted.tenantId), String(a));
    });
    assert.equal((await db.collection('followups').findOne({ tenantId: b })).theme, 'B');
    assert.equal((await db.collection('pushrecords').findOne({ tenantId: b })).title, 'B');
    const oldSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'synthetic-care-records-http';
    const app = express();
    app.use('/api/staff', require('../src/routes/staff'));
    const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
    try {
      const url = `http://127.0.0.1:${server.address().port}/api/staff/push-records`;
      for (const [staffId, expected] of [[staffA, 2], [staffB, 1]]) {
        const token = jwt.sign({ id: String(staffId), type: 'admin' }, process.env.JWT_SECRET);
        const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
        const body = await response.json();
        assert.equal(response.status, 200, JSON.stringify(body));
        assert.equal(body.data.total, expected);
      }
      await db.collection('tenants').updateOne({ _id: b }, { $set: { status: 'suspended' } });
      const blocked = await fetch(url, { headers: { authorization: `Bearer ${jwt.sign({ id: String(staffB), type: 'admin' }, process.env.JWT_SECRET)}` } });
      assert.equal(blocked.status, 403);
    } finally {
      await new Promise(resolve => server.close(resolve));
      if (oldSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = oldSecret;
    }
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

test('isolated Mongo: migration tags only Jiayihui patient records and is repeatable', { skip: !base }, async () => {
  assert.match(base, /^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\/?$/);
  const dbName = `jiayicare_tenant_migration_${randomUUID().replaceAll('-', '')}`;
  const uri = `${base.replace(/\/$/, '')}/${dbName}`;
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db;
  const tenantId = new mongoose.Types.ObjectId();
  const patientId = new mongoose.Types.ObjectId();
  try {
    await db.collection('tenants').insertOne({ _id: tenantId, code: 'jiayihui', status: 'active' });
    await db.collection('users').insertOne({ _id: patientId, tenantId, phone: 'synthetic' });
    await db.collection('followups').insertOne({ patientId, staffId: new mongoose.Types.ObjectId() });
    await db.collection('pushrecords').insertOne({ patientId, staffId: new mongoose.Types.ObjectId(), type: 'knowledge' });
    const script = path.resolve(__dirname, '../src/scripts/assignJiayihuiCareRecordsTenant.js');
    const run = args => execFileSync(process.execPath, [script, ...args], { env: { ...process.env, MONGODB_URI: uri }, cwd: path.resolve(__dirname, '..'), encoding: 'utf8' });
    assert.match(run([]), /"unassigned": 1/);
    const args = ['--apply', '--backup-confirmed', '--expect-followups=1', '--expect-pushrecords=1'];
    assert.match(run(args), /followups: 1/);
    assert.match(run(args), /followups: 0/);
    assert.equal(String((await db.collection('followups').findOne({})).tenantId), String(tenantId));
    assert.equal(String((await db.collection('pushrecords').findOne({})).tenantId), String(tenantId));
    const orphanId = new mongoose.Types.ObjectId();
    await db.collection('followups').insertOne({ _id: orphanId, patientId: new mongoose.Types.ObjectId(), staffId: new mongoose.Types.ObjectId() });
    assert.throws(() => run(['--apply', '--backup-confirmed', '--expect-followups=2', '--expect-pushrecords=1']), /客户归属与预检不一致/);
    assert.equal((await db.collection('followups').findOne({ _id: orphanId })).tenantId, undefined);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
