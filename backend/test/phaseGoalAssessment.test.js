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
test('生活方式按整月不同日期归纳，核对行动指向待查随访', () => {
  const records = [1,8,15,31,31].map(n=>({type:'exercise',label:'运动',recordedAt:'2026-10-'+String(n).padStart(2,'0'),value:'【晚上】快走',recordedBy:{source:'customer'}}));
  const [changes,life,analysis,actions]=assessment({period:{end:'2026-10-31'},recentHealthRecords:records,periodReports:[],periodFollowups:[{theme:'核对复查结果',date:'2026-10-20',status:'planned'}]});
  assert.match(changes[0],/建议阶段目标（待确认）/);
  assert.match(life[0],/暂时无法判断相关性/);
  assert.match(analysis[1],/核对复查结果/);
  assert.match(actions[0],/健管专员.*健康顾问.*核对复查结果/);
  assert.match(actions[1],/顾问.*目标范围/);
});

test('期初维持目标和最近两次体测按同名同单位核对',()=>{
 const plan={confirmedAt:'2026-09-01',moduleData:{management_targets:{records:[{goal:'维持体重',goalMetric:{source:'vital',key:'weight',operator:'lte',targetValue:72}}]}}};
 const context={openingPlan:plan,confirmedAnnualPlan:plan,period:{start:'2026-10-01',end:'2026-10-31'},recentHealthRecords:['01','31'].map(d=>({type:'weight',value:70,unit:'kg',recordedAt:'2026-10-'+d})),periodFollowups:[],periodReports:[],latestBodyReports:['10-12','09-02'].map((d,i)=>({checkDate:'2026-'+d,reportItems:[{name:'体脂率',unit:'%',value:25-i}]}))};
 const [changes,relation]=assessment(context);
 assert.match(changes[5],/09-02.*24 → 25%（\+1个百分点）/);
 assert.match(changes[0],/继续维持/);
});

test('多日监测保留首末值，历史体测可作为报告前值，已设指标带入评估',()=>{
 const result=assessment({period:{start:'2026-10-01',end:'2026-10-31'},recentHealthRecords:['01','31'].map((d,i)=>({type:'bloodPressure',label:'血压',unit:'mmHg',value:i?'125/82':'128/84',recordedAt:'2026-10-'+d})),bodyCompHistory:[{measuredAt:'2026-07-15',bodyFatRate:'25'}],latestBodyReports:[{checkDate:'2026-10-13',reportItems:[{name:'体脂率',value:'24.6',unit:'%'}]}],periodReports:[],periodFollowups:[],periodTargets:[{metric:'血压',goal:'维持',range:'约定范围',frequency:'每周一次'}]});
 assert.match(result[0][3],/2天.*128\/84mmHg → 2026-10-31 125\/82mmHg/);
 assert.match(result[0][5],/07-15.*25 → 24.6%/);
 assert.match(result[0][0],/血压.*维持.*每周一次/);
});

test('同日多次测量按天均衡，未记录行为的日子不进入对照',()=>{
 const records=['01','02','03','04','05','06','07'].flatMap((d,i)=>{
   const recordedAt='2026-10-'+d;
   return [{type:'bloodPressure',value:i===0?'190/100':i<=3?'120/80':'110/75',recordedAt},...(i<6?[{type:'diet',value:i<3?'应酬':'没有应酬',recordedAt}]:[])]
 });
 const res=assessment({period:{end:'2026-10-31'},recentHealthRecords:records,periodReports:[],periodFollowups:[],periodTargets:[{metric:'血压'}]});
 assert.match(res[1][0],/应酬／无应酬.*次日收缩压 120 \/ 110 mmHg.*3 \/ 3 天/);
});

test('无应酬未饮酒结合自评睡眠质量；单纯睡眠时长不能判断质量',()=>{
 const make=(date,type,value,extra)=>({recordedAt:'2026-10-'+date,type,value,extra});
 const rows=['01','02','03','04','05','06','07'].flatMap((date,i)=>[make(date,'diet','没有应酬'),make(date,'alcohol','无'),make(date,'sleep','8',i===0?{}:{sleepQuality:i<=3?'良好':'较差'}),make(date,'bloodPressure',i<=3?'120/80':'130/85')]);
 const ctx={recentHealthRecords:rows,period:{end:'2026-10-31'},periodTargets:[],periodReports:[],periodFollowups:[]};
 assert.match(assessment(ctx)[1][0],/睡眠好的3天，平均血压 120\/80.*较差的3天，平均血压 130\/85/);
 assert.match(assessment({...ctx,recentHealthRecords:rows.map(r=>({...r,extra:{}}))})[1][0],/6天.*缺少明确的睡眠质量/);
});

test('四组按明确的应酬饮酒记录分组，每个健康指标独立按天统计',()=>{
 const make=(type,value)=>({type,value,recordedAt:'2026-10-01'});
 const records=[make('diet','【晚餐】应酬'),make('alcohol','6瓶330'),make('weight','70'),make('bloodPressure','120/80'),make('bloodPressure','130/80'),make('bowel','2')];
 const ctx={recentHealthRecords:records,period:{end:'2026-10-31'},periodReports:[],periodFollowups:[]};
 assert.match(assessment(ctx)[1][0],/暂时无法判断相关性/);
 assert.doesNotMatch(assessment(ctx)[1][0],/排便 1天，平均 2 次/);
});

test('饮酒次日排便按相邻自然日配对，排便性状分型和漏记日期不计为次数',()=>{
 const r=(d,type,value)=>({recordedAt:'2026-10-'+d,type,value});
 const records=[r('01','diet','应酬'),r('01','alcohol','啤酒'),r('02','bowel','3次'),r('02','alcohol','无'),r('03','bowel','1次/日'),r('03','alcohol','啤酒'),r('04','bowel','布里斯托3型')];
 const ctx={recentHealthRecords:records,period:{end:'2026-10-31'},periodReports:[],periodFollowups:[]};
 assert.match(assessment(ctx)[1][0],/饮酒次日排便：1个有记录的次日平均 3 次.*未饮酒次日：1个有记录的次日平均 1 次/);
});

test('组合分组不遮挡其他行为与血糖，并分清检查前和检查后记录',()=>{
 const rows=[];
 for(let i=1;i<=7;i++){
   const recordedAt='2026-10-0'+i;
   for(const [type,value,extra] of [['diet','无应酬'],['alcohol','无'],['exercise',i<=3?'快走':'未运动'],['mood',i<=3?'平静':'紧张'],['bloodSugar',i<=4?'5':'6',{mealType:'空腹'}]]){
     rows.push({type,value,extra,recordedAt});
   }
 }
 const ctx={period:{start:'2026-10-01',end:'2026-10-31'},recentHealthRecords:rows,periodFollowups:[],periodReports:[],latestBodyReports:['10-04','09-05'].map((d,i)=>({checkDate:'2026-'+d,reportItems:[{name:'体脂率',value:24+i,unit:'%'}]}))};
 const life=assessment(ctx)[1][0];
 assert.match(life,/运动／明确未运动：次日血糖（空腹） 5 \/ 6/);
 assert.match(life,/情绪.*次日血糖（空腹） 5 \/ 6/);
 assert.match(life,/全月.*运动3天.*两次体测.*25 → 24%.*本月截至本次体测.*运动3天／有记录4天/);
});
