const test = require('node:test');
const assert = require('node:assert/strict');
const { readPrintedPage } = require('../src/utils/shawPrintedReport');

function parse(part, text, boxes = [], previous = '') {
  return readPrintedPage(Buffer.alloc(0), 2, {
    readPdfPageLayout: async (_, page) => page === 1 ? previous : text + '\n邵逸夫医院体检报告[' + part + '] Page2/20',
    readPdfPageTextBoxes: async () => boxes,
  });
}

test('skips explicitly identified summaries and declines other layouts', async () => {
  assert.deepEqual(await parse('二、体检小结内容', '检查建议'), { skip: true, items: [] });
  assert.equal(await parse('未知格式', '体检小结'), null);
});

test('keeps each department together after the original measurements', async () => {
  const result = await parse('三A、体检检查内容', '【一般项目(基础)】\n跌倒评分  1\n【眼科体检】\n右眼裸视力  1.0\n左眼裸视力  1.2\n检查医生：示例\n【全科医学检查】\n心脏  未见异常');
  assert.deepEqual(result.items.map(row => row.name), ['跌倒评分','眼科体检','全科医学检查']);
  assert.match(result.items[1].findings, /右眼裸视力.*1.0\n左眼裸视力.*1.2/);
});

test('retains a blank ECG findings column and the separate breath test result', async () => {
  const result = await parse('三B、体检检查报告内容', '【常规心电图】\n检查所见      诊断结论\n                    正常心电图\n备注：\n【C13呼气试验】\n检查所见      诊断结论\n测定值：8.8       阳性+\n正常值：<+4.0');
  assert.equal(result.items[0].findings, '');
  assert.equal(result.items[0].diagnosis, '正常心电图');
  assert.equal(result.items[1].findings, '测定值：8.8\n正常值：<+4.0');
});

test('keeps dual-column values, wrapped ranges, flags and printed order', async () => {
  const boxes = [
    ['名称',48,20],['结果',162,20],['参考范围',216,20],
    ['钾',24,40],['4',150,40],['3.5-5.3mmol/L',203,40],
    ['钠',294,40],['145',420,40],['137-',473,34],['147mmol/L',473,46],
    ['氯',24,60],['H',136,60],['108',150,60],['99-106mmol/L',203,60],
    ['备注：',24,78],
  ].map(([text,x,y]) => ({text,x,y}));
  const result = await parse('三C、体检检验内容', '『电解质』', boxes);
  assert.deepEqual(result.items.map(row => row.name), ['钾','氯','钠']);
  assert.equal(result.items[1].status,'abnormal');
  assert.deepEqual([result.items[2].value,result.items[2].referenceRange,result.items[2].unit], ['145','137-147','mmol/L']);
  assert.equal(await parse('三C、体检检验内容','『电解质』',boxes.filter(word=>word.text!=='参考范围')),null);
});
