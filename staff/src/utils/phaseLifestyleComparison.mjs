// Historical assessments store the comparison groups in their reviewed text.
// Only interpret the generator's labelled, day-counted pairs.
const groups = [
  ['饮食（应酬／无应酬）','有应酬','无应酬'],
  ['运动／明确未运动','运动','未运动'],
  ['睡眠（自评好／差）','睡眠自评好','睡眠自评差'],
  ['情绪（自评轻松／紧张）','情绪轻松','情绪紧张'],
  ['吸烟／明确未吸烟','吸烟','未吸烟'],
  ['饮酒／明确未饮酒','饮酒','未饮酒'],
]

export function readLifestyleComparison(text) {
  const findings = []
  const insufficient = []
  for (const [label, exposed, reference] of groups) {
    const start = text.indexOf(label+'：')
    if (start < 0) continue
    const evidence = text.slice(start+label.length+1).split('；',1)[0]
    if (evidence.startsWith('缺少可比记录')) {
      insufficient.push(exposed)
      continue
    }
    const measures = []
    for (const match of evidence.matchAll(/(次日|测量日)(体重|收缩压|舒张压|排便|血糖(?:（[^）]+）)?) ([\d.]+) \/ ([\d.]+) (kg|mmHg|次\/日|mmol\/L)（两组分别 (\d+) \/ (\d+) 天）/g)) {
      const [,time,metric,a,b,unit,n,m] = match
      if (Math.min(+n,+m)<3) continue
      const delta = Math.round((Number(a)-Number(b))*10)/10
      const difference = delta===0 ? '均值相同' : '平均'+(delta>0?'高':'低')+' '+Math.abs(delta)+' '+unit
      measures.push({metric,time,difference,a,b,unit,n,m})
    }
    if (measures.length) findings.push({exposed,reference,measures})
  }
  return {findings,insufficient}
}
