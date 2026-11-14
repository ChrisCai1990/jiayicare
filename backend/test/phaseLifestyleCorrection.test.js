const test = require('node:test');
const assert = require('node:assert/strict');
const { correctMissingLifestyle } = require('../src/utils/phaseLifestyleCorrection');

test('只修订本期有依据的暂无记录，保留其他板块与人工文字', () => {
  const original = '一、阶段变化\n- 日常健康数据：人工核对\n\n二、生活方式关联\n- 饮食：本期暂无记录。\n- 运动：本期暂无记录。\n- 睡眠：人工确认的说明\n\n三、问题分析\n- 生活方式行为改变：人工结论';
  const result = correctMissingLifestyle(original, [{ type: 'diet', recordedAt: '2026-10-16T12:00:00Z', value: '早餐' }]);
  assert.deepEqual(result.changed, ['饮食']);
  assert.match(result.content, /饮食：2026-10-16.*早餐/);
  assert.match(result.content, /运动：本期暂无记录/);
  assert.match(result.content, /睡眠：人工确认的说明/);
  assert.match(result.content, /生活方式行为改变：人工结论/);
});
