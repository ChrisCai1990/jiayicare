const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
test('紧凑问题卡默认仅问题和建议，来源折叠且重复CT结论只展示一次', async () => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const source = fs.readFileSync(path.join(__dirname, '../../staff/src/components/ReportFollowUpDrafts.jsx'), 'utf8');
  const component = source.slice(source.indexOf('export function ReportIssueCard'), source.indexOf('export default function'));
  const transformed = require('esbuild').transformSync(component.replace('export function', 'function') + '\nReportIssueCard;', { loader: 'jsx' }).code;
  const helpers = await import('../../staff/src/utils/reportIssuePresentation.js');
  const Card = vm.runInNewContext(transformed, { React, ...helpers });
  const html = renderToStaticMarkup(React.createElement(Card, { issue: { title: '胃镜检查所见胃窦黏膜糜烂', sourceName: '胃镜', page: 12, evidence: '胃窦黏膜糜烂', suggestedRecommendation: '结合病理资料评估', advisorRecommendation: '' }, index: 0, disabled: false, onChange() {} }));
  for (const label of ['胃镜检查所见胃窦黏膜糜烂', '第12页', '系统建议草稿', '顾问确认建议', '年度方案']) assert.ok(html.includes(label));
  assert.doesNotMatch(html, /type="date"|需规划师安排服务|终审并发布/);
  assert.doesNotMatch(html, /原文未明确建议|尚无建议草稿|details open/);
  assert.match(html, /rows="2"/);
  const ct = '胸廓对称。\n1.肺内结节（建议年度复查）\n2.肺内纤维索条影\n1.肺内结节（建议年度复查）\n2.肺内纤维索条影\n3.另一不同结论';
  assert.equal(helpers.compactEvidence(ct).split('1.肺内结节').length, 2);
  assert.match(helpers.compactEvidence(ct), /另一不同结论/);
  if (process.env.REPORT_ISSUE_PREVIEW) {
    const css = fs.readFileSync(path.join(__dirname, '../../staff/src/components/ReportFollowUpDrafts.css'), 'utf8');
    const examples = [
      { title: '脂肪肝', group: 'metabolic', evidence: '脂肪肝', suggestedRecommendation: '结合代谢指标评估', sourceRefs: [{ sourceId: 'ct', sourceName: '胸部CT', page: 20, date: '2026-08-01', excerpt: '附见：脂肪肝' }, { sourceId: 'us', sourceName: '肝脏超声', page: 21, date: '2026-09-01', excerpt: '轻度脂肪肝' }] },
      { title: '甘油三酯升高', group: 'metabolic', evidence: '结果：2.52mmol/L\n参考范围：0.45—1.81', sourceName: '血脂检查', page: 11 },
      { title: '肺内结节', group: 'respiratory', evidence: '肺内结节', originalRecommendation: '建议年度复查', sourceName: '胸部CT', page: 20 },
    ];
    const mergedHtml = renderToStaticMarkup(React.createElement(Card, {issue:examples[0], index:0,disabled:false,onChange(){}}));
    assert.match(mergedHtml, /合并 2 处依据/);
    assert.match(mergedHtml, /肝脏超声/);
    const cards = helpers.groupedIssues(examples).map(group => `<section class="report-problem-group"><h4>${group.label}<span>${group.issues.length}个问题</span></h4>${group.issues.map((issue,index) => renderToStaticMarkup(React.createElement(Card,{issue,index,disabled:false,onChange(){}}))).join('')}</section>`).join('');
    fs.writeFileSync(process.env.REPORT_ISSUE_PREVIEW, `<html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font-family:system-ui;background:#f3f6f4;margin:32px auto;max-width:1080px;padding:0 16px}${css}</style><section class="report-issues"><h3>病历与报告问题及建议</h3><p>布局预览 · 合成示例</p><div class="report-issues-coverage"><b>3项问题建议</b> · 正常项已略过</div>${cards}</section></html>`);
  }
});
