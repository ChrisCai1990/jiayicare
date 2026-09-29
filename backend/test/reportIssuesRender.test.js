const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
test('实际问题卡渲染完整名称、页码、三类建议且无日期派单控件', () => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const source = fs.readFileSync(path.join(__dirname, '../../staff/src/components/ReportFollowUpDrafts.jsx'), 'utf8');
  const component = source.slice(source.indexOf('export function ReportIssueCard'), source.indexOf('export default function'));
  const transformed = require('esbuild').transformSync(component.replace('export function', 'function') + '\nReportIssueCard;', { loader: 'jsx' }).code;
  const Card = vm.runInNewContext(transformed, { React });
  const html = renderToStaticMarkup(React.createElement(Card, { issue: { title: '胃镜检查所见胃窦黏膜糜烂', sourceName: '胃镜', page: 12, evidence: '胃窦黏膜糜烂', suggestedRecommendation: '结合病理资料评估', advisorRecommendation: '' }, index: 0, disabled: false, onChange() {} }));
  for (const label of ['胃镜检查所见胃窦黏膜糜烂', '第12页', '原文建议', '系统建议草稿', '顾问确认建议', '年度方案编制参考']) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /type="date"|需规划师安排服务|终审并发布/);
});
