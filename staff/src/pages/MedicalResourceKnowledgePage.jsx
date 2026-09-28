import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useToast } from '../App'

const KINDS = [['', '全部类型'], ['department_advantage', '优势科室'], ['expert_recommendation', '专家内部推荐'], ['appointment_rule', '预约信息'], ['visit_guidance', '就诊注意事项'], ['service_case', '服务案例与话术']]

export default function MedicalResourceKnowledgePage() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [selected, setSelected] = useState(null)
  const load = async () => {
    try { const result = await staffAPI.getMedicalResourceKnowledge({ q, kind }); setItems(result.data || []) } catch (error) { toast(error.message) }
  }
  useEffect(() => { const timer = setTimeout(load, 180); return () => clearTimeout(timer) }, [q, kind])
  const resourceLabel = item => [item.institutionId?.name, item.departmentId?.name, item.expertId?.name].filter(Boolean).join(' · ')
  return <div>
    <div className="page-header"><div><div className="page-title">就医资源知识库</div><div className="page-subtitle">仅展示已发布且仍在有效期内的内部资源；具体预约与对外沟通前仍须人工核实。</div></div></div>
    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}><input className="form-input" style={{ width: 300 }} value={q} onChange={event => setQ(event.target.value)} placeholder="搜索医院、科室、专家、疾病方向或预约要点" /><select className="form-input" style={{ width: 180 }} value={kind} onChange={event => setKind(event.target.value)}>{KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {!items.length ? <div className="card"><div className="card-body" style={{ padding: 40, textAlign: 'center', color: '#8AA89C' }}>暂无可用资源知识</div></div> : <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, .9fr) minmax(360px, 1.4fr)', gap: 16 }}><div className="card"><div className="card-body" style={{ padding: 10 }}>{items.map(item => <button key={item._id} type="button" onClick={() => setSelected(item)} style={{ width: '100%', textAlign: 'left', padding: '12px 10px', border: 0, borderBottom: '1px solid #EEF2F0', background: String(selected?._id) === String(item._id) ? '#EFF8F4' : '#fff', color: '#243A32', cursor: 'pointer' }}><div style={{ fontWeight: 650, fontSize: 14 }}>{item.title}</div><div style={{ color: '#60776C', fontSize: 12, marginTop: 4 }}>{resourceLabel(item) || KINDS.find(([value]) => value === item.kind)?.[1]} · v{item.version}</div></button>)}</div></div><div className="card"><div className="card-body">{selected ? <ResourceDetail item={selected} /> : <div style={{ padding: 40, color: '#8AA89C', textAlign: 'center' }}>选择一条资源查看详情</div>}</div></div></div>}
  </div>
}

function ResourceDetail({ item }) {
  const appointment = item.appointmentInfo || {}
  const list = value => Array.isArray(value) ? value.join('、') : value || ''
  const Line = ({ label, value }) => value ? <div style={{ padding: '10px 0', borderBottom: '1px solid #EEF2F0' }}><div style={{ color: '#8AA89C', fontSize: 12, marginBottom: 4 }}>{label}</div><div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>{value}</div></div> : null
  return <><div style={{ fontSize: 20, fontWeight: 700, color: '#1A2B24' }}>{item.title}</div><div style={{ color: '#60776C', fontSize: 13, marginTop: 7 }}>{[item.institutionId?.name, item.departmentId?.name, item.expertId?.name].filter(Boolean).join(' · ')}</div><Line label="适用场景" value={list(item.applicableScenarios)} /><Line label="摘要" value={item.summary} /><Line label="推荐依据与协作经验" value={item.recommendationBasis} /><Line label="预约渠道" value={list(appointment.channels)} /><Line label="建议提前期" value={appointment.advanceDays} /><Line label="资料清单" value={list(appointment.materials)} /><Line label="费用与保险说明" value={appointment.feeAndInsurance} /><Line label="就诊注意事项" value={item.precautions} /><Line label="服务边界" value={item.serviceBoundary} /><Line label="风险提示" value={item.riskNotice} /><div style={{ marginTop: 14, padding: 10, borderRadius: 8, background: '#FFF7E6', color: '#8A5A00', fontSize: 13 }}>本信息仅作为内部协助依据。不得据此承诺号源、费用、保险适用性或诊疗效果；紧急症状应按急诊流程处理。</div></>
}
