import DateField from '../../../../shared/DateField.jsx'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const KINDS = [['department_advantage', '优势科室'], ['expert_recommendation', '专家内部推荐'], ['visit_guidance', '就诊注意事项'], ['service_case', '服务案例与话术']]
const SERVICE_TYPES = [['general_outpatient', '普通门诊'], ['expert_outpatient', '专家门诊/特需门诊'], ['international_outpatient', '国际门诊'], ['checkup', '体检中心'], ['other', '其他预约']]
const STATUS = { draft: '草稿', pending_review: '待审核', published: '已发布', returned: '已退回', expired: '已过期', archived: '已归档' }
const blank = {
  kind: 'department_advantage', title: '', institutionId: '', departmentId: '', expertId: '', tags: '', applicableScenarios: '', summary: '', recommendationBasis: '', ownerId: '', expiresAt: '',
  appointmentInfo: {
    channels: '', advanceDays: '', materials: '', feeAndInsurance: '',
  },
  precautions: '请核实院区、科室、就诊日期与号源状态，并按预约要求提前到院；携带完整资料。如需取消或改期，请按平台或医院规则操作；急重症请直接急诊，不等待普通预约。',
  serviceBoundary: '仅提供就医信息整理、预约路径建议与协作跟进；不承诺指定专家、号源、就诊时间、费用报销或治疗疗效；最终以医院、医生及官方平台规则为准。',
  riskNotice: '出现胸痛、呼吸困难、意识障碍、持续高热、突发肢体无力或言语不清、严重出血等紧急症状，应立即拨打 120 或前往急诊；本条目不替代医生诊断和急救建议。',
  sourceNote: '',
}
const contactBlank = { ...blank, kind: 'appointment_rule', appointmentInfo: { serviceType: '', campus: '', officialPlatform: '', hospitalPhone: '', hospitalEmail: '', internalContactName: '', internalContactPhone: '', bookingSteps: '', verifiedAt: '', channels: '', advanceDays: '', materials: '', feeAndInsurance: '' }, precautions: '', serviceBoundary: '', riskNotice: '', sourceNote: '' }
const dateValue = value => value ? String(value).slice(0, 10) : ''
const listText = value => Array.isArray(value) ? value.join('、') : value || ''

export default function MedicalResourceKnowledgePage() {
  const toast = useToast()
  const [resources, setResources] = useState({ institutions: [], departments: [], experts: [] })
  const [items, setItems] = useState([])
  const [staff, setStaff] = useState([])
  const [filter, setFilter] = useState({ q: '', kind: '', status: '' })
  const [path, setPath] = useState('problem')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [busy, setBusy] = useState(false)
  const loadSequence = useRef(0)
  const load = async () => {
    const sequence = ++loadSequence.current
    try {
      const [knowledge, resourceResult, employeeResult] = await Promise.all([adminAPI.medicalResourceKnowledge({ ...filter, path }), adminAPI.medicalResources(), adminAPI.employees({ limit: 500 })])
      if (sequence !== loadSequence.current) return
      setItems(knowledge.data || []); setResources(resourceResult.data || { institutions: [], departments: [], experts: [] }); setStaff((employeeResult.data || []).filter(item => item.staffStatus !== 'inactive'))
    } catch (error) { if (sequence === loadSequence.current) toast(error.message) }
  }
  useEffect(() => { load() }, [filter.q, filter.kind, filter.status, path])
  const open = item => {
    setEditing(item || null)
    const initial = path === 'contact' ? contactBlank : blank
    const source = item || initial
    setForm({ ...initial, ...source, institutionId: source.institutionId?._id || source.institutionId || '', departmentId: source.departmentId?._id || source.departmentId || '', expertId: source.expertId?._id || source.expertId || '', ownerId: source.ownerId?._id || source.ownerId || '', tags: listText(source.tags), applicableScenarios: listText(source.applicableScenarios), expiresAt: dateValue(source.expiresAt), appointmentInfo: { ...initial.appointmentInfo, ...(source.appointmentInfo || {}), verifiedAt: dateValue(source.appointmentInfo?.verifiedAt), channels: listText(source.appointmentInfo?.channels), materials: listText(source.appointmentInfo?.materials) } })
  }
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }))
  const setAppointment = (key, value) => setForm(current => ({ ...current, appointmentInfo: { ...current.appointmentInfo, [key]: value } }))
  const departments = useMemo(() => resources.departments.filter(item => !form?.institutionId || String(item.institutionId?._id || item.institutionId) === String(form.institutionId)), [resources.departments, form?.institutionId])
  const experts = useMemo(() => resources.experts.filter(item => (!form?.institutionId || String(item.institutionId?._id || item.institutionId) === String(form.institutionId)) && (!form?.departmentId || String(item.departmentId?._id || item.departmentId) === String(form.departmentId))), [resources.experts, form?.institutionId, form?.departmentId])
  const save = async () => {
    const institutionName = resources.institutions.find(item => String(item._id) === String(form.institutionId))?.name || ''
    const serviceName = SERVICE_TYPES.find(([key]) => key === form.appointmentInfo?.serviceType)?.[1] || '预约'
    const payload = form.kind === 'appointment_rule' && !form.title.trim()
      ? { ...form, title: [institutionName, form.appointmentInfo?.campus, serviceName].filter(Boolean).join(' · ') }
      : form
    if (!payload.title.trim()) return toast('请选择医院和预约类型')
    setBusy(true)
    try { editing ? await adminAPI.updateMedicalResourceKnowledge(editing._id, payload) : await adminAPI.createMedicalResourceKnowledge(payload); toast('资源知识条目已保存'); setForm(null); await load() } catch (error) { toast(error.message) } finally { setBusy(false) }
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
  const revise = async item => {
    try {
      const result = await adminAPI.reviseMedicalResourceKnowledge(item._id)
      toast(result.message || '已创建修订草稿')
      open(result.data)
      await load()
    } catch (error) { toast(error.message) }
  }
  const visibleStatus = item => item.status === 'published' && item.expiresAt && new Date(item.expiresAt) <= new Date() ? 'expired' : item.status
  const supersededIds = useMemo(() => new Set(items.map(item => String(item.supersedesId?._id || item.supersedesId || '')).filter(Boolean)), [items])
  const hiddenHistoryCount = !filter.status ? items.filter(item => item.status === 'archived' && supersededIds.has(String(item._id))).length : 0
  const displayedItems = !filter.status ? items.filter(item => !(item.status === 'archived' && supersededIds.has(String(item._id)))) : items
  const previousVersion = item => items.find(candidate => String(candidate._id) === String(item.supersedesId?._id || item.supersedesId || ''))
  const switchPath = next => { setPath(next); setFilter({ q: '', kind: '', status: '' }); setForm(null); setViewing(null) }
  return <div>
    <div className="page-header"><div><div className="page-title">就医资源知识库</div><div className="page-subtitle">分别维护问题就医推荐与医院预约联系方式；审核发布后供医护端使用。</div></div><button className="btn btn-primary" onClick={() => open(null)}>＋ 新建{path === 'contact' ? '预约联系方式' : '问题就医条目'}</button></div>
    <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}><button type="button" className={`btn ${path === 'problem' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchPath('problem')}>按问题找就医资源</button><button type="button" className={`btn ${path === 'contact' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => switchPath('contact')}>按医院找预约联系方式</button></div>
    <div style={{ padding: '12px 16px', background: '#EFF8F4', borderRadius: 10, color: '#1E6B50', fontSize: 13, marginBottom: 16 }}>{path === 'contact' ? '按医院、院区和门诊/体检类型记录官方平台、医院电话与内部联络方式；发布前核实来源和日期。' : '按健康问题或疾病方向记录推荐医院、科室、专家及依据；具体预约联系方式在另一入口维护。'}</div>
    <div className="card"><div className="card-body">
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}><input className="form-input" style={{ width: 250 }} value={filter.q} onChange={event => setFilter(current => ({ ...current, q: event.target.value }))} placeholder={path === 'contact' ? '搜索医院、院区或联系方式' : '搜索健康问题、疾病或推荐资源'} />{path === 'problem' && <select className="form-input" style={{ width: 170 }} value={filter.kind} onChange={event => setFilter(current => ({ ...current, kind: event.target.value }))}><option value="">全部类型</option>{KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>}<select className="form-input" style={{ width: 150 }} value={filter.status} onChange={event => setFilter(current => ({ ...current, status: event.target.value }))}><option value="">全部状态</option>{Object.entries(STATUS).filter(([key]) => key !== 'expired').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      {hiddenHistoryCount > 0 && <div style={{ fontSize: 12, color: '#6B8A7D', marginBottom: 10 }}>已将 {hiddenHistoryCount} 条已有新版本的归档记录收起；选择“已归档”可单独查看。</div>}
      {!displayedItems.length ? <div style={{ padding: 40, textAlign: 'center', color: '#8AA89C' }}>暂无{path === 'contact' ? '预约联系方式' : '问题就医条目'}</div> : <table className="table"><thead><tr><th>{path === 'contact' ? '预约服务' : '问题 / 类型'}</th><th>{path === 'contact' ? '医院 / 院区' : '推荐资源'}</th><th>{path === 'contact' ? '电话 / 邮箱 / 渠道' : '适用场景'}</th><th>责任人 / 版本</th><th>状态</th><th>操作</th></tr></thead><tbody>{displayedItems.map(item => { const status = visibleStatus(item); const previous = previousVersion(item); return <tr key={item._id}><td><b>{item.title}</b><div style={{ fontSize: 12, color: '#8AA89C', marginTop: 3 }}>{path === 'contact' ? (SERVICE_TYPES.find(([key]) => key === item.appointmentInfo?.serviceType)?.[1] || '类型待补') : (KINDS.find(([key]) => key === item.kind)?.[1] || item.kind)}</div></td><td>{path === 'contact' ? ([item.institutionId?.name, item.appointmentInfo?.campus || item.departmentId?.campus, item.departmentId?.name].filter(Boolean).join(' · ') || '-') : ([item.institutionId?.name, item.departmentId?.name, item.expertId?.name].filter(Boolean).join(' · ') || '-')}</td><td>{path === 'contact' ? ([item.appointmentInfo?.hospitalPhone, item.appointmentInfo?.hospitalEmail, item.appointmentInfo?.officialPlatform, item.appointmentInfo?.internalContactPhone].filter(Boolean).join('；') || listText(item.appointmentInfo?.channels) || '-') : (listText(item.applicableScenarios) || '-')}</td><td>{item.ownerId?.name || '-'}<div style={{ fontSize: 12, color: '#8AA89C' }}>v{item.version || 1}{item.expiresAt ? ` · 复核 ${dateValue(item.expiresAt)}` : ''}</div></td><td>{STATUS[status] || status}</td><td style={{ whiteSpace: 'nowrap' }}>{previous && <button className="btn btn-secondary btn-sm" onClick={() => setViewing(previous)}>历史 v{previous.version || 1}</button>}{item.status === 'archived' && <><button className="btn btn-secondary btn-sm" onClick={() => setViewing(item)}>查看</button> <button className="btn btn-secondary btn-sm" onClick={() => revise(item)}>编辑为新版本</button></>}{['draft', 'returned'].includes(item.status) && <><button className="btn btn-secondary btn-sm" onClick={() => open(item)}>编辑</button> <button className="btn btn-secondary btn-sm" onClick={() => act(item, 'submit')}>送审</button></>}{item.status === 'pending_review' && <><button className="btn btn-primary btn-sm" onClick={() => act(item, 'publish')}>发布</button> <button className="btn btn-secondary btn-sm" onClick={() => act(item, 'return')}>退回</button></>}{item.status === 'published' && <button className="btn btn-secondary btn-sm" onClick={() => act(item, 'archive')}>归档</button>}</td></tr> })}</tbody></table>}
    </div></div>
    {viewing && <KnowledgeView item={viewing} onClose={() => setViewing(null)} />}
    {form && path === 'contact' && <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) setForm(null) }}><div className="modal" style={{ maxWidth: 780 }}><div className="modal-header"><h3 className="modal-title">{editing ? '编辑' : '新建'}预约联系方式</h3><button className="modal-close" onClick={() => setForm(null)}>×</button></div><div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div style={{ gridColumn: 'span 2', color: '#52685D', fontSize: 13 }}>每个院区保存一条；只填写已确认的信息。保存草稿后，核实来源与日期并送审，医护端才会显示。</div>
      <Select label="医院 *" value={form.institutionId} onChange={value => setForm(current => ({ ...current, institutionId: value, departmentId: '' }))} options={resources.institutions.filter(item => item.status === 'active').map(item => [item._id, item.name])} empty="请选择医院" />
      <Select label="预约类型 *" value={form.appointmentInfo.serviceType} onChange={value => setAppointment('serviceType', value)} options={SERVICE_TYPES} />
      <Field label="院区" value={form.appointmentInfo.campus} onChange={value => setAppointment('campus', value)} placeholder="如：钱塘院区" />
      <Field label="医院联系电话" value={form.appointmentInfo.hospitalPhone} onChange={value => setAppointment('hospitalPhone', value)} placeholder="按原始信息填写，不自动补区号" />
      <Field label="医院联系邮箱" type="email" value={form.appointmentInfo.hospitalEmail} onChange={value => setAppointment('hospitalEmail', value)} placeholder="如：example@hospital.com" />
      <Field label="官方预约平台/路径" value={form.appointmentInfo.officialPlatform} onChange={value => setAppointment('officialPlatform', value)} placeholder="仅填写已核实的平台或链接" />
      <details style={{ gridColumn: 'span 2', borderTop: '1px solid #E5ECE8', paddingTop: 12 }}><summary style={{ cursor: 'pointer', color: '#1E6B50', fontWeight: 600 }}>更多信息与发布核实（选填，送审时补齐）</summary><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
        <Field label="显示名称（留空自动生成）" value={form.title} onChange={value => set('title', value)} placeholder="医院 · 院区 · 预约类型" />
        <Select label="关联科室/体检中心" value={form.departmentId} onChange={value => set('departmentId', value)} options={departments.filter(item => item.status === 'active').map(item => [item._id, `${item.name}${item.campus ? ` · ${item.campus}` : ''}`])} empty="不关联" />
        <Select label="责任人" value={form.ownerId} onChange={value => set('ownerId', value)} options={staff.map(item => [item._id, `${item.name}${item.title ? ` · ${item.title}` : ''}`])} empty="当前创建人" />
        <Field label="内部联络人" value={form.appointmentInfo.internalContactName} onChange={value => setAppointment('internalContactName', value)} />
        <Field label="内部联络电话" value={form.appointmentInfo.internalContactPhone} onChange={value => setAppointment('internalContactPhone', value)} />
        <Field label="其他预约渠道" value={form.appointmentInfo.channels} onChange={value => setAppointment('channels', value)} placeholder="多个渠道用顿号分隔" />
        <Text span label="具体预约步骤与适用条件" value={form.appointmentInfo.bookingSteps} onChange={value => setAppointment('bookingSteps', value)} />
        <Field label="建议提前期" value={form.appointmentInfo.advanceDays} onChange={value => setAppointment('advanceDays', value)} />
        <Field label="上次核实日期" type="date" value={form.appointmentInfo.verifiedAt} onChange={value => setAppointment('verifiedAt', value)} />
        <Text label="需准备材料" value={form.appointmentInfo.materials} onChange={value => setAppointment('materials', value)} />
        <Text label="费用与保险说明" value={form.appointmentInfo.feeAndInsurance} onChange={value => setAppointment('feeAndInsurance', value)} />
        <Field label="下次复核日期" type="date" value={form.expiresAt} onChange={value => set('expiresAt', value)} />
        <Text label="信息来源与核实人" value={form.sourceNote} onChange={value => set('sourceNote', value)} />
        <Text span label="就诊注意事项" value={form.precautions} onChange={value => set('precautions', value)} />
      </div></details>
    </div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setForm(null)}>取消</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存草稿'}</button></div></div></div>}
    {form && path === 'problem' && <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) setForm(null) }}><div className="modal" style={{ maxWidth: 780 }}><div className="modal-header"><h3 className="modal-title">{editing ? '编辑' : '新建'}问题就医条目</h3><button className="modal-close" onClick={() => setForm(null)}>×</button></div><div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <Select label="资源类型 *" value={form.kind} onChange={value => set('kind', value)} options={KINDS} /><Field label="标题 *" value={form.title} onChange={value => set('title', value)} placeholder="如：浙二心内科疑难转诊协作要点" />
      <Select label="关联医院" value={form.institutionId} onChange={value => setForm(current => ({ ...current, institutionId: value, departmentId: '', expertId: '' }))} options={resources.institutions.filter(item => item.status === 'active').map(item => [item._id, item.name])} empty="不关联" /><Select label="关联科室" value={form.departmentId} onChange={value => setForm(current => ({ ...current, departmentId: value, expertId: '' }))} options={departments.filter(item => item.status === 'active').map(item => [item._id, `${item.name}${item.campus ? ` · ${item.campus}` : ''}`])} empty="不关联" />
      <Select label="关联专家" value={form.expertId} onChange={value => set('expertId', value)} options={experts.filter(item => item.status === 'active').map(item => [item._id, `${item.name}${item.title ? ` · ${item.title}` : ''}`])} empty="不关联" /><Select label="责任人" value={form.ownerId} onChange={value => set('ownerId', value)} options={staff.map(item => [item._id, `${item.name}${item.title ? ` · ${item.title}` : ''}`])} empty="当前创建人" />
      <Field label="标签" value={form.tags} onChange={value => set('tags', value)} placeholder="疾病方向、城市等，用顿号分隔" /><Field label="下次复核日期" type="date" value={form.expiresAt} onChange={value => set('expiresAt', value)} />
      <Text span label="适用场景" value={form.applicableScenarios} onChange={value => set('applicableScenarios', value)} placeholder="哪些会员需求、转诊条件适用；多个用顿号分隔" /><Text span label="简要说明" value={form.summary} onChange={value => set('summary', value)} />
      <Text span label="推荐依据与内部协作经验" value={form.recommendationBasis} onChange={value => set('recommendationBasis', value)} />
      <div style={{ gridColumn: 'span 2', padding: 10, borderRadius: 8, background: '#F2F8F5', color: '#52685D', fontSize: 13 }}>医院电话、官方平台及具体预约步骤请到“按医院找预约联系方式”维护。</div>
      <Text span label="就诊注意事项" value={form.precautions} onChange={value => set('precautions', value)} /><Text span label="服务边界（必填建议）" value={form.serviceBoundary} onChange={value => set('serviceBoundary', value)} placeholder="不得承诺指定专家、号源、疗效等" /><Text span label="风险提示" value={form.riskNotice} onChange={value => set('riskNotice', value)} placeholder="紧急症状和需立即转急诊的情形" /><Text span label="来源说明" value={form.sourceNote} onChange={value => set('sourceNote', value)} placeholder="来源渠道、核实日期或附件说明" />
    </div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setForm(null)}>取消</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存草稿'}</button></div></div></div>}
  </div>
}
function KnowledgeView({ item, onClose }) { const info = item.appointmentInfo || {}; const rows = item.kind === 'appointment_rule' ? [['预约类型', SERVICE_TYPES.find(([key]) => key === info.serviceType)?.[1]], ['院区', info.campus], ['官方预约平台/路径', info.officialPlatform], ['医院联系电话', info.hospitalPhone], ['医院联系邮箱', info.hospitalEmail], ['内部联络人', info.internalContactName], ['内部联络电话', info.internalContactPhone], ['其他预约渠道', listText(info.channels)], ['具体预约步骤与适用条件', info.bookingSteps], ['上次核实日期', dateValue(info.verifiedAt)], ['建议提前期', info.advanceDays], ['需准备材料', listText(info.materials)], ['费用与保险说明', info.feeAndInsurance], ['就诊注意事项', item.precautions], ['信息来源与核实人', item.sourceNote]] : [['简要说明', item.summary], ['推荐依据与内部协作经验', item.recommendationBasis], ['就诊注意事项', item.precautions], ['服务边界', item.serviceBoundary], ['风险提示', item.riskNotice], ['来源说明', item.sourceNote]]; return <div className="modal-overlay" onClick={event => { if (event.target === event.currentTarget) onClose() }}><div className="modal" style={{ maxWidth: 760 }}><div className="modal-header"><h3 className="modal-title">归档条目 · {item.title}</h3><button className="modal-close" onClick={onClose}>×</button></div><div className="modal-body">{rows.map(([label, value]) => <div key={label} style={{ marginBottom: 14 }}><div className="form-label">{label}</div><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, color: '#334155' }}>{value || '—'}</div></div>)}</div><div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>关闭</button></div></div></div> }
function Field({ label, value, onChange, placeholder = '', type = 'text' }) { return <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">{label}</label><DateField className="form-input" type={type} value={value || ''} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></div> }
function Text({ label, value, onChange, placeholder = '', span = false }) { return <div className="form-group" style={{ marginBottom: 0, gridColumn: span ? 'span 2' : undefined }}><label className="form-label">{label}</label><textarea className="form-input" rows={3} value={value || ''} onChange={event => onChange(event.target.value)} placeholder={placeholder} /></div> }
function Select({ label, value, onChange, options, empty = '请选择' }) { return <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">{label}</label><select className="form-input" value={value || ''} onChange={event => onChange(event.target.value)}><option value="">{empty}</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></div> }
