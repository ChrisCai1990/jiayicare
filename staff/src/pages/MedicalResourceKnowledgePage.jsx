import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useToast } from '../App'

const PROBLEM_KINDS = [['', '全部类型'], ['department_advantage', '优势科室'], ['expert_recommendation', '专家内部推荐'], ['visit_guidance', '就诊注意事项'], ['service_case', '服务案例与话术']]
const SERVICE_TYPES = { general_outpatient: '普通门诊', expert_outpatient: '专家门诊/特需门诊', international_outpatient: '国际门诊', checkup: '体检中心', other: '其他预约' }
const list = value => Array.isArray(value) ? value.join('、') : value || ''
const date = value => value ? String(value).slice(0, 10) : ''

export default function MedicalResourceKnowledgePage() {
  const toast = useToast()
  const [path, setPath] = useState('problem')
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    let active = true
    const timer = setTimeout(async () => {
      try {
        const result = await staffAPI.getMedicalResourceKnowledge({ path, q, ...(path === 'problem' ? { kind } : {}) })
        if (active) setItems(result.data || [])
      } catch (error) { if (active) toast(error.message) }
    }, 180)
    return () => { active = false; clearTimeout(timer) }
  }, [path, q, kind])

  const switchPath = next => { setPath(next); setQ(''); setKind(''); setItems([]); setSelected(null) }
  const label = item => path === 'contact'
    ? [item.institutionId?.name, item.appointmentInfo?.campus || item.departmentId?.campus, item.departmentId?.name].filter(Boolean).join(' · ')
    : [item.institutionId?.name, item.departmentId?.name, item.expertId?.name].filter(Boolean).join(' · ')

  return <div>
    <div className="page-header"><div><div className="page-title">就医资源</div><div className="page-subtitle">{path === 'contact' ? '按医院、院区和服务类型查看预约渠道与联系方式；使用前请再次核实。' : '按健康问题查看医院、科室与专家的内部推荐依据。'}</div></div></div>
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      <button type="button" className={`btn ${path === 'problem' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchPath('problem')}>按问题找就医资源</button>
      <button type="button" className={`btn ${path === 'contact' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchPath('contact')}>按医院找预约联系方式</button>
    </div>
    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
      <input className="form-input" style={{ width: 320 }} value={q} onChange={event => setQ(event.target.value)} placeholder={path === 'contact' ? '搜索医院、院区、电话或预约平台' : '搜索健康问题、疾病、医院或科室'} />
      {path === 'problem' && <select className="form-input" style={{ width: 180 }} value={kind} onChange={event => setKind(event.target.value)}>{PROBLEM_KINDS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>}
    </div>
    {!items.length ? <div className="card"><div className="card-body" style={{ padding: 40, textAlign: 'center', color: '#8AA89C' }}>暂无已发布且有效的{path === 'contact' ? '预约联系方式' : '问题就医资源'}</div></div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
      <div className="card"><div className="card-body" style={{ padding: 10 }}>{items.map(item => <button key={item._id} type="button" onClick={() => setSelected(item)} style={{ width: '100%', textAlign: 'left', padding: '12px 10px', border: 0, borderBottom: '1px solid #EEF2F0', background: String(selected?._id) === String(item._id) ? '#EFF8F4' : '#fff', color: '#243A32', cursor: 'pointer' }}><div style={{ fontWeight: 650, fontSize: 14 }}>{item.title}</div><div style={{ color: '#60776C', fontSize: 12, marginTop: 4 }}>{label(item) || '-'} · {path === 'contact' ? (SERVICE_TYPES[item.appointmentInfo?.serviceType] || '类型待补') : `v${item.version}`}</div></button>)}</div></div>
      <div className="card"><div className="card-body">{selected ? (path === 'contact' ? <ContactDetail item={selected} /> : <ProblemDetail item={selected} />) : <div style={{ padding: 40, color: '#8AA89C', textAlign: 'center' }}>选择一条资源查看详情</div>}</div></div>
    </div>}
  </div>
}

function DetailLine({ label, value }) {
  if (!value) return null
  return <div style={{ padding: '10px 0', borderBottom: '1px solid #EEF2F0' }}><div style={{ color: '#8AA89C', fontSize: 12, marginBottom: 4 }}>{label}</div><div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 14, lineHeight: 1.6 }}>{value}</div></div>
}

function ProblemDetail({ item }) {
  const oldBooking = item.appointmentInfo || {}
  const hasOldBooking = !!(oldBooking.channels?.length || oldBooking.advanceDays || oldBooking.materials?.length || oldBooking.feeAndInsurance)
  return <><div style={{ fontSize: 20, fontWeight: 700, color: '#1A2B24' }}>{item.title}</div><div style={{ color: '#60776C', fontSize: 13, marginTop: 7 }}>{[item.institutionId?.name, item.departmentId?.name, item.expertId?.name].filter(Boolean).join(' · ')}</div><DetailLine label="适用问题与场景" value={list(item.applicableScenarios)} /><DetailLine label="摘要" value={item.summary} /><DetailLine label="推荐依据与协作经验" value={item.recommendationBasis} /><DetailLine label="就诊注意事项" value={item.precautions} /><DetailLine label="服务边界" value={item.serviceBoundary} /><DetailLine label="风险提示" value={item.riskNotice} />{hasOldBooking && <details style={{ marginTop: 14 }}><summary style={{ cursor: 'pointer' }}>历史预约说明（请以医院最新信息核实）</summary><DetailLine label="预约渠道" value={list(oldBooking.channels)} /><DetailLine label="建议提前期" value={oldBooking.advanceDays} /><DetailLine label="需准备材料" value={list(oldBooking.materials)} /><DetailLine label="费用与保险说明" value={oldBooking.feeAndInsurance} /></details>}<div style={{ marginTop: 14, padding: 10, borderRadius: 8, background: '#FFF7E6', color: '#8A5A00', fontSize: 13 }}>推荐资料仅供内部协助参考；最终医院、科室和专家安排以人工核实结果为准。</div></>
}

function ContactDetail({ item }) {
  const info = item.appointmentInfo || {}
  return <><div style={{ fontSize: 20, fontWeight: 700, color: '#1A2B24' }}>{item.title}</div><div style={{ color: '#60776C', fontSize: 13, marginTop: 7 }}>{[item.institutionId?.name, info.campus || item.departmentId?.campus, item.departmentId?.name].filter(Boolean).join(' · ')} · {SERVICE_TYPES[info.serviceType] || '预约类型待补'}</div><DetailLine label="医院联系电话" value={info.hospitalPhone} /><DetailLine label="医院联系邮箱" value={info.hospitalEmail} /><DetailLine label="官方预约平台/路径" value={info.officialPlatform} /><DetailLine label="内部联络人" value={info.internalContactName} /><DetailLine label="内部联络电话" value={info.internalContactPhone} /><DetailLine label="其他预约渠道" value={list(info.channels)} /><DetailLine label="具体预约步骤与适用条件" value={info.bookingSteps} /><DetailLine label="建议提前期" value={info.advanceDays} /><DetailLine label="需准备材料" value={list(info.materials)} /><DetailLine label="费用与保险说明" value={info.feeAndInsurance} /><DetailLine label="就诊注意事项" value={item.precautions} /><DetailLine label="上次核实日期" value={date(info.verifiedAt)} /><DetailLine label="下次复核日期" value={date(item.expiresAt)} /><div style={{ marginTop: 14, padding: 10, borderRadius: 8, background: '#FFF7E6', color: '#8A5A00', fontSize: 13 }}>预约前请再次核实电话、院区、号源和医院当日规则；本资料不保证预约成功。</div></>
}
