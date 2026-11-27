const test = require('node:test');
const assert = require('node:assert/strict');
const {assessment, render} = require('../src/utils/phaseGoalAssessment');
const {templateAssessmentFromContent} = require('../src/utils/phaseAssessment');
const {headings} = require('../src/utils/reviewFourSections');

test('同次就医办结与各项目结果独立，周记录和撤销事项按来源核对', () => {
  const confirmedAnnualPlan = {
    _id:'plan', confirmedAt:'2026-09-01', moduleData:{
      monitoring:{records:[{metricType:'weight',frequency:'每周一次'}]},
      management_targets:{records:[
        {issueId:'a',goal:'关注血脂',goalMetric:{source:'report_item',name:'指标甲',unit:'U'}},
        {issueId:'b',goal:'关注肾功能',goalMetric:{source:'report_item',name:'指标乙',unit:'U'}},
        {goal:'已撤销目标',advisorExcluded:true},
      ]},
    },
  };
  const result=assessment({confirmedAnnualPlan, period:{start:'2026-10-01',end:'2026-10-31'},
    recentHealthRecords:['05','12','19','26'].map(d=>({type:'weight',label:'体重',value:'70',recordedAt:'2026-10-'+d,recordedBy:{source:'customer'}})),
    periodFollowups:[{date:'2026-10-10',completedAt:'2026-10-10',status:'completed',sourceAnnualPlanId:'plan',managementIssueIds:['a','b']},
      {date:'2026-10-14',status:'cancelled'}],
    periodReports:[{checkDate:'2026-10-10',reportItems:[{name:'指标甲',unit:'U',value:'5'}]}],
  });
  assert.match(result[0][1],/每周一次.*连续记录最长4周/);
  assert.match(result[0][2],/到期随访1项.*按期1项/);
  assert.match(result[0][4],/指标甲.*基线.*指标乙.*未匹配/);
  const content=render(result);
  assert.doesNotMatch(content,/已撤销目标/);
  const published=templateAssessmentFromContent(content,{templateSnapshot:{outputSections:headings}});
  assert.equal(published.sections.length,4);
  assert.equal(published.sections[0].items.length,7);
});
