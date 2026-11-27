const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const tools = require('../../shared/annualBookingPlan.cjs');
const staffRequire = require('node:module').createRequire(path.join(__dirname, '../../staff/package.json'));
const React = staffRequire('react'), { renderToStaticMarkup } = staffRequire('react-dom/server');
const source = fs.readFileSync(path.join(__dirname, '../../staff/src/components/AnnualBookingCard.jsx'), 'utf8');
const fieldContext = { module: { exports: {} }, require: name => name === 'react' ? React : 'input' };
vm.runInNewContext(require('esbuild').transformSync(fs.readFileSync(path.join(__dirname, '../../staff/src/components/ProxyAppointmentFields.jsx'), 'utf8'), { loader: 'jsx', format: 'cjs' }).code, fieldContext);
const context = { module: { exports: {} }, require: name => name === 'react' ? React : name.endsWith('ProxyAppointmentFields') ? fieldContext.module.exports : name.endsWith('annualBookingDisplay.cjs') ? require('../../shared/annualBookingDisplay.cjs') : name.endsWith('annualBookingPlan.cjs') ? tools : name.endsWith('annualServiceItem.cjs') ? require('../../shared/annualServiceItem.cjs') : { staffAPI: {} } };
vm.runInNewContext(require('esbuild').transformSync(source, { loader: 'jsx', format: 'cjs' }).code, context);
const task = { sourceType: 'scheduled', sourceAnnualPlanId: 'a', sourceScheduleKey: 'abnormal_followup:2026-12-02:x', deliveryMode: 'single', status: 'planned', assignedTo: 'manager', plannedContent: '就医/会诊医院：浙二医院\n科室：泌尿外科\n专家：王医生\n项目：肾脏彩超\n原因：顾问既定计划' };
const render = patch => renderToStaticMarkup(React.createElement(context.module.exports.default, { task: { ...task, ...patch }, staff: { _id: 'manager', role: 'healthManager' } }));
test('advisor requirements render once as labelled read-only values; inputs are date/time/note only', () => {
  const html = render();
  assert.match(html, /浙二医院/); assert.match(html, /泌尿外科/); assert.match(html, /王医生/);
  assert.match(html, /type="date"/); assert.match(html, /type="time"/);
  assert.equal((html.match(/<input/g) || []).length, 2);
  assert.match(html, /<details[^>]*><summary[^>]*>查看顾问完整依据/);
  assert.doesNotMatch(html, /预约科室<input|>编辑<|>删除</);
});
test('booking summary distinguishes proxy visits and errands and uses the recorded order department', () => {
  const plannedContent = '开单科室：心内科\n检查科室：超声科\n项目：心脏超声';
  const html = render({ deliveryType: 'proxy_visit', plannedContent });
  assert.match(html, /帮助客户预约代诊，联系开单科室落实检查单，逐项核对检查预约方式/);
  assert.ok(html.indexOf('本次任务要求') < html.indexOf('顾问预约要求'));
  assert.match(render({ deliveryType: 'proxy_booking' }), /为客户代办预约/);
  assert.doesNotMatch(render({}), /帮助客户预约代诊/);
});
test('missing hospital is fillable; missing department needs advisor, not a manager department input', () => {
  const html = render({ plannedContent: '科室：泌尿外科' });
  assert.match(html, /实际预约医院（顾问未指定）/);
  const missing = render({ plannedContent: '就医/会诊医院：浙二' });
  assert.match(missing, /顾问尚未明确科室/); assert.match(missing, /button[^>]*disabled/);
});
test('manager cannot alter or delete advisor-owned plan; execution-only values remain separate', () => {
  assert.equal(tools.canEditPlan(task, 'healthManager'), false);
  assert.equal(tools.canEditPlan(task, 'familyDoctor'), true);
  for (const body of [{ date: '2026-10-01' }, { content: '替换计划' }, { assignedTo: 'other' }, { status: 'cancelled' }]) assert.equal(tools.protectedEdit(task, 'healthManager', body), true);
  assert.equal(tools.protectedEdit(task, 'healthManager', { executedContent: '预约记录' }), false);
  assert.equal(tools.canEditPlan({ sourceType: 'order' }, 'healthManager'), true);
});
