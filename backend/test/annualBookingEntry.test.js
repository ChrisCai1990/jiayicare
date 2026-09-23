const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../staff/src/pages/PatientDetailPage.jsx'), 'utf8');
test('actual appointment entry opens advisor-plan/booking detail, not completion form', () => {
  const start = source.indexOf('const openExec = (f) => {');
  // Run the actual leading branch; reaching the old path must remain detectable.
  const prefix = source.slice(start, source.indexOf("if (medicalProxyStage", start));
  const branchEnd = prefix.indexOf('\n    }') + '\n    }'.length;
  assert.ok(start > 0 && branchEnd > 10);
  const entry = source.slice(start, start + branchEnd);
  for (const f of [{ annualBookingTask: true, plannedContent: '顾问：肾脏彩超，浙二超声科' }, { sourceType: 'annual_service', workflowKey: 'service_request' }]) {
    let detail;
    vm.runInNewContext(entry + '\n throw new Error("旧事务入口"); }; openExec(f)', { f, setFollowUpDetail: row => { detail = row; } });
    assert.equal(detail, f);
  }
  assert.throws(() => vm.runInNewContext(entry + '\n throw new Error("旧事务入口"); }; openExec(f)', { f: { sourceType: 'scheduled', deliveryMode: 'reminder' }, setFollowUpDetail: () => assert.fail('纯提醒不能改成预约') }), /旧事务入口/);
});
