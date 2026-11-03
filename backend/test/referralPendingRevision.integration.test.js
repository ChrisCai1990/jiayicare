const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const net = require('node:net');
const mongoose = require('mongoose');
const router = require('../src/routes/staff');
const scheduleRouter = require('../src/routes/staffAvailability');
const Case = require('../src/models/ExpertConsultationCase');
const Order = require('../src/models/Order');
const StaffAvailability = require('../src/models/StaffAvailability');
const Referral = require('../src/models/Referral');
const { tenantContext } = require('../src/utils/tenantScope');

const oid = () => new mongoose.Types.ObjectId();
const handler = (source, method, route) => source.stack.find(layer => layer.route?.path === route && layer.route.methods[method]).route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const withTenant = (tenantId, request, callback) => new Promise((resolve, reject) => tenantContext({ ...request, staff: request.staff && { ...request.staff, tenantId }, user: request.user && { ...request.user, tenantId } }, {}, () => Promise.resolve().then(callback).then(resolve, reject)));

test('pending referral revisions preserve old material and reject other authors or accepted letters',
  { skip: !process.env.TEST_MONGOD, timeout: 60000 }, async t => {
    const dbpath = mkdtempSync(path.join(tmpdir(), 'expert-consultation-'));
    const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const value = server.address().port; server.close(() => resolve(value)); }); });
    const mongod = spawn(process.env.TEST_MONGOD, ['--dbpath', dbpath, '--bind_ip', '127.0.0.1', '--port', String(port)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    t.after(async () => { await mongoose.disconnect(); mongod.kill(); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Mongo startup timeout')), 30000);
      mongod.once('error', reject); mongod.once('exit', code => reject(new Error(`Mongo exited ${code}`)));
      mongod.stdout.on('data', chunk => { if (String(chunk).includes('Waiting for connections')) { clearTimeout(timer); resolve(); } });
      mongod.stderr.resume();
    });
    await mongoose.connect(`mongodb://127.0.0.1:${port}/expert_consultation_test`, { autoIndex: false });
    const tenantId = oid(), patientId = oid(), sender = oid(), receiver = oid();
    await mongoose.connection.db.collection('users').insertOne({ _id:patientId, tenantId });
    const original = await Referral.create({ patientId, fromStaffId:sender, toStaffId:receiver, reason:'原诉求', questionList:'原问题', status:'pending', attachedHealthInfo:{ basicInfo:'原资料' } });
    const call = async (who, body) => {
      const req = { staff:{ _id:who, tenantId, name:'测试顾问' }, params:{ id:String(original._id) }, body };
      const res = response();
      await withTenant(tenantId, req, () => handler(router, 'patch', '/referrals/:id/resubmit')(req,res));
      return res;
    };
    const payload = { reason:'调整诉求', questionList:'调整问题', toStaffId:String(receiver), attachedHealthInfo:{ basicInfo:'原资料', screeningRecords:[{ 项目:'测试筛查', 结果:'测试结果' }] } };
    assert.equal((await call(oid(),payload)).statusCode,404);
    assert.equal((await call(sender,{...payload,toStaffId:String(oid())})).statusCode,409);
    const result = await call(sender,payload);
    assert.equal(result.statusCode,200,JSON.stringify(result.body));
    let saved = await Referral.findById(original._id);
    assert.equal(saved.questionList,'调整问题');
    assert.equal(saved.attachedHealthInfo.screeningRecords.length,1);
    assert.equal(saved.revisionHistory[0].questionList,'原问题');
    assert.deepEqual(saved.revisionHistory[0].attachedHealthInfo,{basicInfo:'原资料'});
    saved.status='accepted'; await saved.save();
    assert.equal((await call(sender,payload)).statusCode,409);
    saved.status='rejected'; await saved.save();
    assert.equal((await call(sender,payload)).statusCode,200);
  });
