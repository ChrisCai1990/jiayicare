const test = require('node:test');
const assert = require('node:assert/strict');
const { welcomeGreeting, introduction } = require('../src/utils/serviceGroupEvents');
test('北京时间时段边界，凌晨及无效时间回退您好', () => {
 for (const [time,word] of [['05:59','您好'],['06:00','上午好'],['11:59','上午好'],['12:00','下午好'],['17:59','下午好'],['18:00','晚上好'],['23:59','晚上好'],['00:00','您好']]) {
  assert.equal(welcomeGreeting({serviceType:'nutrition'},{name:'吴女士'},`2026-11-16T${time}:00+08:00`),`吴女士，${word}，欢迎加入您的专属营养干预服务群。`);
 }
 assert.equal(welcomeGreeting({}, {}, 'invalid'),'您好，欢迎加入您的专属服务群。');
});
test('四类群统一欢迎格式，保留自我介绍和成员介绍，不重复客户姓名', () => {
 for(const [serviceType,suffix] of Object.entries({advisor:'嘉医服务群',nutrition:'营养干预服务群',medical:'就医服务群',specialty:'专病管理群'})) {
  const patient={name:'吴女士',assignedHealthManager:'manager'};
  const result=introduction({serviceType},patient,[{_id:'manager',name:'嘉小瑞'}],false,new Date('2026-11-16T09:00:00+08:00'));
  assert.ok(result.content.startsWith(`吴女士，上午好，欢迎加入您的专属${suffix}。我是小嘉，健管专员的 AI 助手，您的 AI 健康管家。`));
  assert.ok(result.content.includes('@嘉小瑞 健管专员是您的日常服务联系人'));
  assert.equal(result.mentions[0].id,'manager');
  assert.ok(introduction({serviceType},patient,[],true).content.startsWith('服务团队成员已更新。'));
 }
});
