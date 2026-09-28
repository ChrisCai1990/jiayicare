import React, { useEffect, useMemo, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const KINDS = [['department_advantage', '优势科室'], ['expert_recommendation', '专家内部推荐'], ['appointment_rule', '预约信息'], ['visit_guidance', '就诊注意事项'], ['service_case', '服务案例与话术']]
const STATUS = { draft: '草稿', pending_review: '待审核', published: '已发布', returned: '已退回', expired: '已过期', archived: '已归档' }
const blank = {
  kind: 'department_advantage', title: '', institutionId: '', departmentId: '', expertId: '', tags: '', applicableScenarios: '', summary: '', recommendationBasis: '', ownerId: '', expiresAt: '',
  appointmentInfo: {
    channels: '医院官方公众号/小程序、官方挂号平台或电话；内部协调仅按已确认合作机制执行。',
    advanceDays: '以医院实际放号周期为准，建议尽早关注官方号源。',
    materials: '本人有效身份证件、医保卡/医保电子凭证、既往病历与检查报告、影像资料（含原始资料）、用药清单、转诊资料（如有）',
    feeAndInsurance: '费用以医院当日公示为准；医保报销范围、比例及是否需要备案，以参保地和医院最新政策为准，服务团队不承诺报销结果。',
  },
  precautions: '请核实院区、科室、就诊日期与号源状态，并按预约要求提前到院；携带完整资料。如需取消或改期，请按平台或医院规则操作；急重症请直接急诊，不等待普通预约。',
  serviceBoundary: '仅提供就医信息整理、预约路径建议与协作跟进；不承诺指定专家、号源、就诊时间、费用报销或治疗疗效；最终以医院、医生及官方平台规则为准。',
  riskNotice: '出现胸痛、呼吸困难、意识障碍、持续高热、突发肢体无力或言语不清、严重出血等紧急症状，应立即拨打 120 或前往急诊；本条目不替代医生诊断和急救建议。',
  sourceNote: '信息来源：医院官方渠道及内部协作记录；请在每次复核时补充核实日期、核实人和链接或附件。',
}
const dateValue = value => value ? String(value).slice(0, 10) : ''
const listText = value => Array.isArray(value) ? value.join('、') : value || ''

export default function MedicalResourceKnowledgePage() {
  const toast = useToast()
  const [resources, setResources] = useState({ institutions: [], departments: [], experts: [] })
  const [items, setItems] = useState([])
  const [staff, setStaff] = useState([])
  const [filter, setFilter] = useState({ q: '', kind: '', status: '' })
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = async () => {
    try {
      const [knowledge, resourceResult, employeeResult] = await Promise.all([adminAPI.medicalResourceKnowledge(filter), adminAPI.medicalResources(), adminAPI.employees({ limit: 500 })])
      setItems(knowledge.data || []); setResources(resourceResult.data || { institutions: [], departments: [], experts: [] }); setStaff((employeeResult.data || []).filter(item => item.staffStatus !== 'inactive'))
    } catch (error) { toast(error.message) }
  }
  useEffect(() => { load() }, [filter.q, filter.kind, filter.status])
  const open = item => {
    setEditing(item || null)
    const source = item || blank
    setForm({ ...blank, ...source, institutionId: source.institutionId?._id || source.institutionId || '', departmentId: source.departmentId?._id || source.departmentId || '', expertId: source.expertId?._id || source.expertId || '', ownerId: source.ownerId?._id || source.ownerId || '', tags: listText(source.tags), applicableScenarios: listText(source.applicableScenarios), expiresAt: dateValue(source.expiresAt), appointmentInfo: { ...blank.appointmentInfo, ...(source.appointmentInfo || {}), channels: listText(source.appointmentInfo?.channels), materials: listText(source.appointmentInfo?.materials) } })
  }
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const setAppointment = (key, value) => setForm(current => ({ ...current, appointmentInfo: { ...current.appointmentInfo, [key]: value } }))
  const departments = useMemo(() => resources.departments.filter(item => !form?.institutionId || String(item.institutionId?._id || item.institutionId) === String(form.institutionId)), [resources.departments, form?.institutionId])
  const experts = useMemo(() => resources.experts.filter(item => (!form?.institutionId || String(item.institutionId?._id || item.institutionId) === String(form.institutionId)) && (!form?.departmentId || String(item.departmentId?._id || item.departmentId) === String(form.departmentId))), [resources.experts, form?.institutionId, form?.departmentId])
  const save = async () => {
    if (!form.title.trim()) return toast('请填写标题')
    setBusy(true)
    try { editing ? await adminAPI.updateMedicalResourceKnowledge(editing._id, form) : await adminAPI.createMedicalResourceKnowledge(form); toast('资源知识条目已保存'); setForm(null); await load() } catch (error) { toast(error.message) } finally { setBusy(false) }
  }
  const act = async (item, action) => {
    try {
      if (action === 'submit') await adminAPI.submitMedicalResourceKnowledge(item._id)
      if (action === 'publish') await adminAPI.reviewMedicalResourceKnowledge(item._id, 'publish')
      if (action === 'return') await adminAPI.reviewMedicalResourceKnowledge(item._id, 'return')
      if (action === 'archive') await adminAPI.archiveMedicalResourceKnowledge(item._id)
      toast({ submit: '已送审', publish: '已发布', return: '已退回修改', archive: '已归档' }[action]); await load()
    } catch (error) { toast(error.message) }
  }
  const visibleStatus = item => item.status === 'published' && item.expiresAt && new Date(item.expiresAt) <= new Date() ? 'expired' : item.status
  return <div>
    <div className="page-header"><div><div className="page-title">就医资源知识库</div><div className="page-subtitle">沉淀内部推荐、预约规则和就诊要点；仅已发布且未过期的条目可被医护端与 AI 引用。</div></div><button className="btn btn-primary" onClick={() => open(null)}>＋ 新建知识条目</button></div>
    <div style={{ padding: '12px 16px', background: '#EFF8F4', borderRadius: 10, color: '#1E6B50', fontSize: 13, marginBottom: 16 }}>引用到会员方案时会自动冻结资源版本快照；后续更新、归档或到期，不会篡改既有服务记录。</div>
    <div className="card"><div className="card-body">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}><input className="form-input" style={{ width: 250 }} value={filter.q} onChange={event => setFilter(current => ({ ...current, q: event.target.value }))} placeholder="搜索标题、标签或场景" /><select className="form-input" style={{ width: 170 }} value={filter.kind} onChange={event => setFilter(current => ({ ...current, kind: event.target.value }))}><option value="">全部类型</option>{KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select className="form-input" style={{ width: 150 }} value={filter.status} onChange={event => setFilter(current => ({ ...current, status: event.target.value }))}><option value="">全部状态</option>{Object.entries(STATUS).filter(([key]) => key !== 'expired').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      {!items.length ? <div style={{ padding: 40, textAlign: 'center', color: '#8AA89C' }}>暂无资源知识条目</div> : <table className="table"><thead><tr><th>标题 / 类型</th><th>关联资源</th><th>适用场景</th><th>责任人 / 版本</th><th>状态</th><th>操作</th></tr></thead><tbody>{items.map(item => { const status = visibleStatus(item); return <tr key={item._id}><td><b>{item.title}</b><div style={{ fontSize: 12, color: '#8AA89C', marginTop: 3 }}>{KINDS.find(([key]) => key === item.kind)?.[1] || item.kind}</div></td><td>{[item.institutionId?.name, item.departmentId?.name, item.expertId?.name].filter(Boolean).join(' · ') || '-'}</td><td>{listText(item.applicableScenarios) || '-'}</td><td>{item.ownerId?.name || '-'}<div style={{ fontSize: 12, color: '#8AA89C' }}>v{item.version || 1}{item.expiresAt ? ` · 复核 ${dateValue(item.expiresAt)}` : ''}</div></td><td>{STATUS[status] || status}</td><td style={{ whiteSpace: 'nowrap' }}>{['draft', 'returned'].includes(item.status) && <><button className="btn btn-secondary btn-sm" onClick={() => open(item)}>编辑</button> <button className="btn btn-secondary btn-sm" onClick={() => act(item, 'submit')}>送审</button></>}{item.status === 'pending_review' && <><button className="btn btn-primary btn-sm" onClick={() => act(item, 'publish')}>发布</button> <button className="btn btn-secondary btn-sm" onClick={() => act(item, 'return')}>退回</button></>}{item.status === 'published' && <button className="btn btn-secondary btn-sm" onClick={() => act(item, 'archive')}>归档</button>}</td></tr> })}</tbody></table>}
    </div></div>
    {form && <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) setForm(null) }}><div className="modal" style={{ maxWidth: 780 }}><div className="modal-header"><h3 className="modal-title">{editing ? '编辑' : '新建'}资源知识条目</h3><button className="modal-close" onClick={() => setForm(null)}>×</button></div><div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Select label="资源类型 *" value={form.kind} onChange={value => set('kind', value)} options={KINDS} /><Field label="标题 *" value={form.title} onChange={value => set('title', value)} placeholder="如：浙二心内科疑难转诊协作要点" />
      <Select label="关联医院" value={form.institutionId} onChange={value => setForm(current => ({ ...current, institutionId: value, departmentId: '', expertId: '' }))} options={resources.institutions.filter(item => item.status === 'active').map(item => [item._id, item.name])} empty="不关联" /><Select label="关联科室" value={form.departmentId} onChange={value => setForm(current => ({ ...current, departmentId: value, expertId: '' }))} options={departments.filter(item => item.status === 'active').map(item => [item._id, `${item.name}${item.campus ? ` · ${item.campus}` : ''}`])} empty="不关联" />
      <Select label="关联专家" value={form.expertId} onChange={value => set('expertId', value)} options={experts.filter(item => item.status === 'active').map(item => [item._id, `${item.name}${item.title ? ` · ${item.title}` : ''}`])} empty="不关联" /><Select label="责任人" value={form.ownerId} onChange={value => set('ownerId', value)} options={staff.map(item => [item._id, `${item.name}${item.title ? ` · ${item.title}` : ''}`])} empty="当前创建人" />
      <Field label="标签" value={form.tags} onChange={value => set('tags', value)} placeholder="疾病方向、城市等，用顿号分隔" /><Field label="下次复核日期" type="date" value={form.expiresAt} onChange={value => set('expiresAt', value)} />
      <Text span label="适用场景" value={form.applicableScenarios} onChange={value => set('applicableScenarios', value)} placeholder="哪些会员需求、转诊条件适用；多个用顿号分隔" /><Text span label="简要说明" value={form.summary} onChange={value => set('summary', value)} />
      <Text span label="推荐依据与内部协作经验" value={form.recommendationBasis} onChange={value => set('recommendationBasis', value)} /><Field label="预约渠道" value={form.appointmentInfo.channels} onChange={value => setAppointment('channels', value)} placeholder="官方平台、电话、内部协调等" /><Field label="建议提前期" value={form.appointmentInfo.advanceDays} onChange={value => setAppointment('advanceDays', value)} placeholder="如：7–14天" />
      <Text label="需准备材料" value={form.appointmentInfo.materials} onChange={value => setAppointment('materials', value)} placeholder="多个用顿号分隔" /><Text label="费用与保险说明" value={form.appointmentInfo.feeAndInsurance} onChange={value => setAppointment('feeAndInsurance', value)} />
      <Text span label="就诊注意事项" value={form.precautions} onChange={value => set('precautions', value)} /><Text span label="服务边界（必填建议）" value={form.serviceBoundary} onChange={value => set('serviceBoundary', value)} placeholder="不得承诺指定专家、号源、疗效等" /><Text span label="风险提示" value={form.riskNotice} onChange={value => set('riskNotice', value)} placeholder="紧急症状和需立即转急诊的情形" /><Text span label="来源说明" value={form.sourceNote} onChange={value => set('sourceNote', value)} placeholder="来源渠道、核实日期或附件说明" />
    </div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setForm(null)}>取消</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存草稿'}</button></div></div></div>}
  </div>
}
function Field({ label, value, onChange, placeholder = '', type = 'text' }) { return <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">{label}</label><input className="form-input" type={type} value={value || ''} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></div> }
function Text({ label, value, onChange, placeholder = '', span = false }) { return <div className="form-group" style={{ marginBottom: 0, gridColumn: span ? 'span 2' : undefined }}><label className="form-label">{label}</label><textarea className="form-input" rows={3} value={value || ''} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></div> }
function Select({ label, value, onChange, options, empty = '请选择' }) { return <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">{label}</label><select className="form-input" value={value || ''} onChange={event => onChange(event.target.value)}><option value="">{empty}</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></div> }
