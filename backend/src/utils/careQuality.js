const config = require('../../../shared/careFlow.cjs');
function summarize(flows) {
  const groups = new Map(), rows = [];
  for(const f of flows) {
    for(const e of f.events || []) {
      if(e.action !== 'return') continue;
      const correction = (f.events || []).find(v => v.action === 'correct' && v.token === e.token);
      const reviews = (f.events || []).filter(v => v.action === 'quality_review' && v.token === e.token);
      const key = `${e.targetStage}:${e.targetId}:${e.category}`;
      const g=groups.get(key)||{stage:e.targetStage,person:e.targetName,personId:e.targetId,category:e.category,count:0,completed:0,durationMs:0,cases:new Set()};
      g.count++;g.cases.add(String(f._id));if(correction){g.completed++;g.durationMs+=correction.durationMs||0;}groups.set(key,g);
      rows.push({flowId:String(f._id),title:f.state.title,...e,correction,reviews});
    }
  }
  return { flows:flows.length,returns:rows.length,groups:[...groups.values()].map(g=>({...g,cases:g.cases.size,repeatCount:g.count-g.cases.size,averageHours:g.completed?+(g.durationMs/g.completed/3600000).toFixed(2):null})),rows };
}
module.exports={summarize};
