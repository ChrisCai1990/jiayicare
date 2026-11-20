import React from 'react'

const sections = {
  medical: ['01', '医疗服务'],
  management: ['02', '健康管理'],
  checkup: ['03', '年度体检'],
}

export function annualSectionFor(moduleKey) {
  if (moduleKey === 'annual_checkup') return 'checkup'
  if (['medical_treatment', 'specialist_collab', 'checkup_completion', 'abnormal_followup', 'functional_medicine', 'medication'].includes(moduleKey)) return 'medical'
  return 'management'
}

export const medicalGroups = [
  { title: '安排就医', keys: ['medical_treatment', 'specialist_collab'] },
  { title: '完善检查', keys: ['checkup_completion', 'functional_medicine'] },
  { title: '定期复查', keys: ['abnormal_followup'] },
]

export default function AnnualPlanSection({ section, children }) {
  const [number, title] = sections[section]
  return <section className={`annual-track-panel annual-track-panel--${section}`}>
    <h3 className="annual-track-heading"><span className="annual-track-number">{number}</span>{title}</h3>
    {children}
  </section>
}
