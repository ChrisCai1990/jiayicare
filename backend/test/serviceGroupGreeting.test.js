const test = require('node:test');
const assert = require('node:assert/strict');
const { removeIntroduction, quickGreeting } = require('../src/utils/serviceGroupAssistant');
test('截图中的重复介绍被移除，保留实际服务内容', () => {
 assert.equal(removeIntroduction('您好！我是小嘉，您的AI健康管家～有什么健康问题或需要帮忙的地方，随时告诉我哦！'), '有什么健康问题或需要帮忙的地方，随时告诉我哦！');
 assert.equal(removeIntroduction('我是小嘉，您的AI健康管家。请告诉我您想预约的时间。'), '请告诉我您想预约的时间。');
 assert.equal(removeIntroduction('请告诉我您想预约的时间。'), '请告诉我您想预约的时间。');
});
test('只有纯招呼直接响应，混合问题仍走原流程', () => {
 assert.ok(quickGreeting('你好！')); assert.ok(quickGreeting('在吗？'));
 assert.equal(quickGreeting('你好，我胸痛'), null); assert.equal(quickGreeting('帮我预约'), null);
});

