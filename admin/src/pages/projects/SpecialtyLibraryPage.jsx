import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useAdmin } from '../../App'

const empty = { title: '', diseases: [], overview: '', serviceBoundary: '', roles: '', diaryGuide: '', exceptionGuide: '', sourceNote: '', clinicalReviewer: '', stages: [] }
const ibd = {
  title: 'IBD 院外全程管理', diseases: ['克罗恩病', '溃疡性结肠炎', '未定型结肠炎（IBD-U）'],
  overview: '管理期限为 1 年。以专科医师意见为依据，由健康顾问负责个性化方案与专科沟通，健管专员执行预约、陪诊、日常跟进与反馈。标准路径仅供参考，实际节点按客户情况调整。',
  serviceBoundary: '首次及后续复诊陪诊包含在服务内；医院诊疗、检查、药品等费用由客户另付。诊断、用药与治疗调整由专科医师决定。异常情况先联系健康顾问，紧急情况及时就医。',
  roles: '健康规划师：接单后了解客户并转介。健康顾问：客户负责人，确定医院、科室、专家；审核病历及 AI 随访草案；对接专科医师并确认个性化方案。健管专员：预约与陪诊；跟进日常记录，将情况反馈健康顾问。专科医师：诊疗并决定治疗与复诊安排。',
  diaryGuide: '供客户日常记录：排便次数及性状、便血、腹痛、体温、疲劳、用药及漏服、肠外表现；体重和饮食生活情况可按方案记录。记录频次及需要追踪的指标由健康顾问结合专科方案确定。',
  exceptionGuide: '客户改期、健康变化、药物遗漏、专家停诊或检查延迟时，只处理当前节点并记录原因；由健康顾问与专科医师确认需要改变的后续安排。未到达的节点不提前生成待办。',
  sourceNote: '初稿依据合作方提供的 CD、UC、IBD-U 一年管理路径与转归问答材料整理；发布前应由本机构临床负责人审核。', clinicalReviewer: '',
  stages: [
    { title: '接单与初步接触', purpose: '核对服务权益、联系方式及既往诊疗资料。', owner: '健康规划师', trigger: '商城订单进入工作台后', handoff: '向健康顾问交接客户需求与已有资料。' },
    { title: '专科资源确认', purpose: '确定适合的医院、科室与专家，并与客户确认就诊安排。', owner: '健康顾问', trigger: '完成初步接触后', handoff: '将预约要求交健管专员执行。' },
    { title: '首次预约与陪诊', purpose: '完成首次就诊陪诊，收集专科意见与病历。', owner: '健管专员', trigger: '医院与专家确定后', handoff: '病历归档至客户专病管理档案，反馈健康顾问。' },
    { title: '个性化方案确认', purpose: '依据专科医师意见形成随访安排。AI 可起草，健康顾问审核。', owner: '健康顾问', trigger: '收到首诊病历后', handoff: '向健管专员下达当前可执行的跟进事项。' },
    { title: '日常跟进与动态调整', purpose: '按客户实际方案跟进记录、检查、复诊及药物执行情况。', owner: '健管专员', trigger: '健康顾问确认个性化方案后', handoff: '异常反馈健康顾问；涉及诊疗变更由健康顾问对接专科医师。' },
    { title: '复诊与年度回顾', purpose: '按专科意见预约和陪诊，记录病历及方案变化，年度总结。', owner: '健康顾问、健管专员', trigger: '专科方案或客户情况要求复诊时', handoff: '更新客户实际方案；不机械沿用标准时间点。' },
  ],
}

const statusText = { draft: '草稿', published: '已发布', archived: '已归档' }
const fieldLabels = { title: '专病名称', overview: '服务概述', serviceBoundary: '服务边界', roles: '岗位职责与交接', diaryGuide: '客户日常记录参考', exceptionGuide: '延误与异常处理', sourceNote: '来源与审核备注', clinicalReviewer: '临床审核人（发布前填写）' }
const stageFields = { title: '阶段名称', purpose: '目标与工作内容', owner: '责任岗位', trigger: '启动条件', handoff: '完成与交接要求' }

export default function SpecialtyLibraryPage() {
  const { admin } = useAdmin()
  const canEdit = admin?.role === 'superadmin'
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = async () => { try { setItems((await adminAPI.specialtyLibrary()).data || []) } catch (e) { setError(e.message) } }
  useEffect(() => { load() }, [])
  const start = (item, template = empty) => { setEditing(item || null); setForm(JSON.parse(JSON.stringify(item || template))); setError('') }
  const change = (field, value) => setForm(current => ({ ...current, [field]: value }))
  const stageChange = (index, field, value) => setForm(current => ({ ...current, stages: current.stages.map((stage, i) => i === index ? { ...stage, [field]: value } : stage) }))
  const save = async () => {
    setBusy(true); setError('')
    try { editing ? await adminAPI.updateSpecialtyLibrary(editing._id, form) : await adminAPI.createSpecialtyLibrary(form); setForm(null); await load() } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const act = async (item, action) => {
    const prompt = action === 'publish' ? '确认本机构已审核内容并发布给医护团队？' : action === 'archive' ? '归档后医护端将不再看到此版本，确定继续？' : null
    if (prompt && !window.confirm(prompt)) return
    setBusy(true); setError('')
    try {
      const result = action === 'publish' ? await adminAPI.publishSpecialtyLibrary(item._id) : action === 'archive' ? await adminAPI.archiveSpecialtyLibrary(item._id) : await adminAPI.reviseSpecialtyLibrary(item._id)
      await load()
      if (action === 'revise') start(result.data)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <div>
    <div className="page-header"><div><div className="page-title">专病管理库</div><div className="page-subtitle">维护标准服务路径；每位客户的实际方案由健康顾问根据专科意见单独制定。</div></div>{canEdit && <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary" onClick={() => start(null, ibd)}>新建 IBD 草稿</button><button className="btn btn-primary" onClick={() => start(null)}>＋ 新建专病</button></div>}</div>
    <div style={{ padding: 12, background: '#EFF8F4', color: '#1E6B50', borderRadius: 8, marginBottom: 16 }}>发布版本供医护端查阅。修订会生成新版本，不改变客户既有病历、方案或待办；系统不会按标准路径一次性创建全年任务。</div>
    {error && <div style={{ color: '#B42318', marginBottom: 12 }}>{error}</div>}
    <div className="card"><div className="card-body">{!items.length ? <div style={{ padding: 30, textAlign: 'center' }}>暂无专病条目，可由机构管理员建立 IBD 草稿。</div> : <table className="table"><thead><tr><th>专病</th><th>适用类型</th><th>版本</th><th>状态</th><th>操作</th></tr></thead><tbody>{items.map(item => <tr key={item._id}><td><b>{item.title}</b></td><td>{item.diseases?.join('、') || '-'}</td><td>v{item.version}</td><td>{statusText[item.status]}</td><td style={{ whiteSpace: 'nowrap' }}><button className="btn btn-secondary btn-sm" onClick={() => start(item)}>{item.status === 'draft' && canEdit ? '编辑' : '查看'}</button> {canEdit && (item.status === 'draft' ? <button disabled={busy} className="btn btn-primary btn-sm" onClick={() => act(item, 'publish')}>发布</button> : <button disabled={busy} className="btn btn-secondary btn-sm" onClick={() => act(item, 'revise')}>修订为新版本</button>)} {canEdit && item.status === 'published' && <button disabled={busy} className="btn btn-secondary btn-sm" onClick={() => act(item, 'archive')}>归档</button>}</td></tr>)}</tbody></table>}</div></div>
    {form && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 900, maxHeight: '90vh', overflowY: 'auto' }}><div className="modal-header"><h3 className="modal-title">{editing ? `${editing.title} · v${editing.version}` : '新建专病草稿'}</h3><button className="modal-close" onClick={() => setForm(null)}>×</button></div><div className="modal-body">
      {Object.entries(fieldLabels).map(([key, label]) => <label key={key} style={{ display: 'block', marginBottom: 12, fontSize: 13, fontWeight: 600 }}>{label}{key === 'title' ? ' *' : ''}{key === 'title' ? <input className="form-input" style={{ width: '100%', marginTop: 5 }} disabled={!canEdit || editing?.status !== 'draft' && !!editing} value={form[key] || ''} onChange={e => change(key, e.target.value)} /> : <textarea className="form-input" style={{ width: '100%', minHeight: 75, marginTop: 5 }} disabled={!canEdit || editing?.status !== 'draft' && !!editing} value={form[key] || ''} onChange={e => change(key, e.target.value)} />}</label>)}
      <label style={{ display: 'block', marginBottom: 12, fontSize: 13, fontWeight: 600 }}>适用疾病类型<input className="form-input" style={{ width: '100%', marginTop: 5 }} disabled={!canEdit || editing?.status !== 'draft' && !!editing} value={form.diseases?.join('、') || ''} onChange={e => change('diseases', e.target.value.split(/[、,，]/).map(x => x.trim()).filter(Boolean))} placeholder="用顿号分隔" /></label>
      <h3>标准服务阶段</h3>{(form.stages || []).map((stage, index) => <div key={index} style={{ background: '#F7FAF9', padding: 12, borderRadius: 8, marginBottom: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><b>阶段 {index + 1}</b>{canEdit && (!editing || editing.status === 'draft') && <button className="btn btn-secondary btn-sm" onClick={() => change('stages', form.stages.filter((_, i) => i !== index))}>移除</button>}</div>{Object.entries(stageFields).map(([key, label]) => <label key={key} style={{ display: 'block', fontSize: 13, marginTop: 8 }}>{label}<input className="form-input" style={{ width: '100%', marginTop: 3 }} disabled={!canEdit || editing?.status !== 'draft' && !!editing} value={stage[key] || ''} onChange={e => stageChange(index, key, e.target.value)} /></label>)}</div>)}
      {canEdit && (!editing || editing.status === 'draft') && <button className="btn btn-secondary" onClick={() => change('stages', [...(form.stages || []), { title: '', purpose: '', owner: '', trigger: '', handoff: '' }])}>＋ 添加阶段</button>}
    </div><div className="modal-footer"><button className="btn btn-secondary" onClick={() => setForm(null)}>关闭</button>{canEdit && (!editing || editing.status === 'draft') && <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '保存中…' : '保存草稿'}</button>}</div></div></div>}
  </div>
}
