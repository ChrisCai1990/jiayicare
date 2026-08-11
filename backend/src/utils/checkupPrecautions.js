const PRECAUTION_TEMPLATES = [
  {
    key: 'c13_breath_test',
    match: /(碳|尿素)?\s*13\s*[cC]?\s*(尿素)?呼气|[cC]\s*13\s*呼气/,
    title: 'C13呼气试验',
    text: '【重点准备】检查前按体检机构要求空腹；抑酸药、抗菌药、铋剂等可能影响结果，停药时间必须提前向开单医生或体检中心确认，切勿自行停药。检查过程中按要求呼气，两次采样之间不要饮食、饮水、吸烟或剧烈运动。',
  },
  {
    key: 'gastro_colonoscopy',
    match: /胃肠镜|胃镜.*肠镜|肠镜.*胃镜|无痛胃镜|无痛肠镜/,
    title: '胃肠镜检查',
    text: '【重点准备】需提前完成麻醉及用药评估。按体检中心要求禁食禁饮并进行肠道准备；抗凝药、降糖药等是否调整必须遵医嘱，切勿自行停药。检查前按要求选择少渣饮食，勿佩戴首饰；无痛检查后需由家属陪同，24小时内避免驾车及高风险操作。',
  },
  {
    key: 'gastroscopy',
    match: /胃镜/,
    title: '胃镜检查',
    text: '【重点准备】需提前完成检查及用药评估，并按体检中心要求禁食禁饮。抗凝药、降糖药等是否调整必须遵医嘱，切勿自行停药。无痛检查后需由家属陪同，24小时内避免驾车及高风险操作。',
  },
  {
    key: 'colonoscopy',
    match: /肠镜/,
    title: '肠镜检查',
    text: '【重点准备】提前按体检中心要求进行少渣饮食和肠道准备，并完成用药评估。抗凝药、降糖药等是否调整必须遵医嘱，切勿自行停药。无痛检查后需由家属陪同，24小时内避免驾车及高风险操作。',
  },
  {
    key: 'coronary_cta',
    match: /冠(状动脉|脉).*(CTA|cta|CT血管)|冠脉\s*(CTA|cta)/,
    title: '冠脉CTA',
    text: '【重点准备】检查前向医生说明过敏史、哮喘、甲状腺疾病、肾功能及当前用药，携带近期肾功能结果；按机构要求控制饮食饮水。检查可能使用含碘对比剂及控制心率药物，相关药物是否暂停或调整必须由医生决定，切勿自行停药。',
  },
]

function matchCheckupPrecaution(name = '') {
  return PRECAUTION_TEMPLATES.find(item => item.match.test(String(name))) || null
}

function applyCheckupPrecautions(items = []) {
  let matched = 0
  const nextItems = items.map(item => {
    const template = matchCheckupPrecaution(item.name)
    if (!template) return item
    matched += 1
    const existing = String(item.notes || '').trim()
    const notes = existing.includes(template.text) ? existing : [template.text, existing].filter(Boolean).join('\n')
    return { ...item, notes, precautionKey: template.key, precautionTitle: template.title, isImportantPrecaution: true }
  })
  return { items: nextItems, matched }
}

module.exports = { PRECAUTION_TEMPLATES, matchCheckupPrecaution, applyCheckupPrecautions }
