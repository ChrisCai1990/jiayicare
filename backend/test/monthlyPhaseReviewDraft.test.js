const test = require('node:test');
const assert = require('node:assert/strict');
const HealthRecord = require('../src/models/HealthRecord');
const FollowUp = require('../src/models/FollowUp');
const MedicalReport = require('../src/models/MedicalReport');
const ServiceRecord = require('../src/models/ServiceRecord');
const { buildMonthlyPhaseReviewDraft } = require('../src/utils/monthlyPhaseReviewDraft');

const query = rows => ({ sort: () => ({ limit: () => ({ select: () => ({ lean: async () => rows }) }) }) });

test('月度四板块仅列已归类的筛查数据，医疗记录条数不冒充原因分析', async t => {
  t.mock.method(HealthRecord, 'find', () => query([{ type: 'weight', label: '体重', recordedAt: new Date('2026-10-10') }]));
  t.mock.method(FollowUp, 'find', () => query([]));
  t.mock.method(ServiceRecord, 'find', () => query([
    { date: new Date('2026-10-05'), title: '门诊复查', medicalEscort: { hospital: '甲医院', department: '内科' } },
    { date: new Date('2026-10-20'), title: '门诊就医', medicalEscort: { hospital: '乙医院', department: '外科' } },
  ]));
  t.mock.method(MedicalReport, 'find', () => query([{ checkDate: '2026-10-20', title: '复查报告', screeningL1:'慢病筛查', reportItems: [{ name: '检查甲', value: '5.1', unit: '单位', status: 'normal' }, { name: '检查乙', value: '6.2', unit: '单位', status: 'abnormal' }] }]));
  const draft = await buildMonthlyPhaseReviewDraft({ _id: 'synthetic' }, { start: new Date('2026-09-30T16:00:00Z'), end: new Date('2026-10-31T15:59:59Z') });
  assert.match(draft.content, /一、阶段变化/);
  assert.match(draft.content, /三、问题分析/);
  assert.match(draft.content, /检查甲 5.1 单位；检查乙 6.2 单位/);
  assert.match(draft.content, /首次或复查属性/);
  assert.doesNotMatch(draft.content, /就医服务记录：2条/);
  assert.doesNotMatch(draft.content, /就医频繁的原因是/);
});

test('月度底稿写明体重下降及同期生活记录，并提出具体核对事项', async t => {
  t.mock.method(HealthRecord, 'find', () => query([
    { type: 'weight', label: '体重', value: '82.5', unit: 'kg', recordedAt: new Date('2026-10-02') },
    { type: 'diet', label: '饮食', value: '早餐：鸡蛋、面包', recordedAt: new Date('2026-10-10') },
    { type: 'exercise', label: '运动', value: '步行30分钟', recordedAt: new Date('2026-10-20') },
    { type: 'weight', label: '体重', value: '79.2', unit: 'kg', recordedAt: new Date('2026-10-28') },
  ]));
  t.mock.method(FollowUp, 'find', () => query([]));
  t.mock.method(ServiceRecord, 'find', () => query([]));
  t.mock.method(MedicalReport, 'find', () => query([]));
  const draft = await buildMonthlyPhaseReviewDraft({ _id: 'synthetic' }, { start: new Date('2026-09-30T16:00:00Z'), end: new Date('2026-10-31T15:59:59Z') });
  assert.match(draft.content, /2026-10-02 82.5 kg → 2026-10-28 79.2 kg，下降3.3 kg/);
  assert.match(draft.content, /早餐：鸡蛋、面包/);
  assert.match(draft.content, /步行30分钟/);
  assert.match(draft.content, /不能认定因果/);
  assert.match(draft.content, /本期暂无明确问题需要新增措施/);
  assert.doesNotMatch(draft.content, /体重下降.*因.*步行/);
});


test('四维数据与五维生活方式保留缺项；原因和计划逐项对应且不猜测',()=>{
 const {sections}=require('../src/utils/reviewFourSections');const blocks=sections({records:[{type:'bloodPressure',label:'血压',value:'120/80',recordedAt:'2026-10-01'},{type:'bowel',label:'大便',value:'成形',recordedAt:'2026-10-02'},{type:'symptom',value:'乏力',recordedAt:'2026-10-03'},{type:'mood',value:'平静',recordedAt:'2026-10-04'}],reports:[{documentCategory:'body_composition',checkDate:'2026-10-03',title:'体成分',reportItems:[{name:'体脂率',value:'25',unit:'%'}]}],followups:[{date:'2026-10-10',theme:'复查预约',status:'cancelled',cancelReason:'客户出差'}]});
 assert.equal(blocks[0].length,4);assert.equal(blocks[1].length,5);assert.match(blocks[0][0],/暂无记录/);assert.match(blocks[0][1],/120\/80.*成形/);assert.match(blocks[0][2],/体脂率 25 %/);assert.match(blocks[0][3],/乏力/);assert.match(blocks[1][4],/平静/);assert.equal(blocks[2].length,2);assert.equal(blocks[3].length,2);assert.match(blocks[2][1],/客户出差/);assert.match(blocks[3][1],/就医或检查完成及时性/);
 const empty=sections();assert.ok(empty[0].every(x=>x.includes('暂无记录')));assert.ok(empty[1].every(x=>x.includes('暂无记录')));assert.doesNotMatch(empty.flat().join(''),/依从性差|每天记录|每日打卡/);
});
