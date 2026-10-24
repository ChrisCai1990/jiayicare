import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import './MdtPacketPanel.css'

const FIELDS = [
  ['goal', '本次会诊目标', '说明本次希望解决的主要问题'],
  ['overview', '病情概览', '只写已记录的事实，未核实内容放入待核实事项'],
  ['timeline', '病程时间线', '按日期记录症状、就诊、检查和治疗的变化'],
  ['symptoms', '症状与功能影响', '发作特点、频率、诱因及生活影响'],
  ['treatment', '治疗与用药经过', '当前及既往用药、治疗效果和停用原因'],
  ['questions', '分学科待回答问题', '分别写清希望各学科回答的问题'],
  ['uncertainties', '待核实事项', '记录矛盾、缺失和需要核查的原始描述'],
  ['disciplineOpinions', '各学科会诊意见', '会后填写，每个学科的意见及依据分开记录'],
  ['conclusion', '综合结论', '会后由健康顾问汇总共识和未解决的问题'],
  ['nextSteps', '后续安排', '事项、负责人、日期或频次'],
]
const TABLES = [
  ['timelineRows', '病程时间轴', [['date', '日期'], ['event', '事件／病程'], ['symptoms', '症状变化'], ['assessment', '当时诊断记录'], ['response', '处置及反应']]],
  ['triggerRows', '诱因与缓解因素', [['factor', '因素／情境'], ['effect', '记录的影响（诱发／缓解）']]],
  ['treatmentRows', '用药与治疗反应', [['treatment', '药物／治疗'], ['period', '时间／剂量'], ['response', '记录的效果或不适'], ['currentStatus', '当前状态']]],
  ['testRows', '关键检查', [['date', '检查日期'], ['test', '项目'], ['originalResult', '报告原始结果'], ['interpretation', '待专家解读']]],
  ['questionRows', '会诊问题清单', [['discipline', '学科'], ['question', '需要回答的问题'], ['expectedAnswer', '期望形成的结论／决策']]],
]
const blankTables = () => Object.fromEntries(TABLES.map(([key]) => [key, []]))
const show = value => value === 0 || value ? String(value) : '未记录'
const dateText = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未记录'
const reportDate = report => report.checkDate || report.reportYear || '日期未记录'
const newForm = (user, medications) => {
  const diseaseSummaries = (user?.diseaseRecords || []).map(record => record.summary || {}).filter(row => row.chiefComplaint || row.presentIllness)
  const summary = diseaseSummaries[0] || user?.medicalRecord?.summary || {}
  return {
    title: '', consultationDate: '', disciplines: '', selectedReportIds: [], tables: blankTables(),
    sections: {
      goal: '', overview: [summary.chiefComplaint, summary.presentIllness].filter(Boolean).join('\n'),
      timeline: '',
      symptoms: (user?.healthProfile?.recentSymptoms || []).join('、'),
      treatment: '',
      questions: '', uncertainties: '', disciplineOpinions: '', conclusion: '', nextSteps: '',
    },
  }
}
const packetForm = row => ({ title: row.title, consultationDate: row.consultationDate || '', disciplines: row.disciplines || '',
  sections: row.sections || {}, tables: { ...blankTables(), ...(row.tables || {}) },
  selectedReportIds: (row.selectedReportIds || []).map(String), version: row.__v })

export default function MdtPacketPanel({ patientId, user, reports, medications, staff, toast }) {
  const [packets, setPackets] = useState([])
  const [packet, setPacket] = useState(null)
  const [form, setForm] = useState(() => newForm(user, medications))
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const availableReports = (reports || []).filter(row => row.audit_status === 'audited')
    .sort((a, b) => String(reportDate(b)).localeCompare(String(reportDate(a))))
  const load = async () => {
    try { const result = await staffAPI.getMdtPackets(patientId); setPackets(result.data || []) }
    catch (error) { toast(error.message || '会诊资料包加载失败', 'error') }
    finally { setLoaded(true) }
  }
  useEffect(() => { setPacket(null); setForm(newForm(user, medications)); setDirty(false); setLoaded(false); load() }, [patientId])
  useEffect(() => { if (!packet && !dirty) setForm(newForm(user, medications)) }, [user, medications])
  const update = patch => { setForm(prev => ({ ...prev, ...patch })); setDirty(true) }
  const section = (key, value) => { setForm(prev => ({ ...prev, sections: { ...prev.sections, [key]: value } })); setDirty(true) }
  const tableRows = (key, rows) => { setForm(prev => ({ ...prev, tables: { ...prev.tables, [key]: rows } })); setDirty(true) }
  const choose = row => { setPacket(row); setForm(packetForm(row)); setDirty(false) }
  const importSource = async () => {
    setBusy(true)
    try {
      const result = await staffAPI.getMdtSourceDraft(patientId, form.selectedReportIds)
      const incoming = result.data.tables || blankTables()
      const imported = TABLES.filter(([key]) => !form.tables?.[key]?.length && incoming[key]?.length)
      if (!imported.length) return toast('档案中没有可带入的新增表格资料；请核对已选报告和专病档案，或手工填写')
      setForm(prev => ({ ...prev, tables: Object.fromEntries(TABLES.map(([key]) => [key, prev.tables?.[key]?.length ? prev.tables[key] : (incoming[key] || [])])) }))
      setDirty(true)
      const counts = result.data.counts || {}
      toast(`档案可用：病程 ${counts.courseEntries || 0} 条、用药 ${counts.medications || 0} 条、检查摘录 ${counts.testExcerpts || 0} 条。已填入空表，请核对后保存。`)
    } catch (error) { toast(error.message || '读取档案失败', 'error') }
    finally { setBusy(false) }
  }
  const save = async () => {
    if (!form.title.trim()) return toast('请填写会诊主题', 'error')
    setBusy(true)
    try {
      const result = packet ? await staffAPI.updateMdtPacket(patientId, packet._id, form) : await staffAPI.createMdtPacket(patientId, form)
      setPacket(result.data)
      const refreshed = await staffAPI.getMdtPackets(patientId)
      const saved = (refreshed.data || []).find(row => row._id === result.data._id)
      if (!saved || saved.__v !== result.data.__v || JSON.stringify(saved.tables || {}) !== JSON.stringify(result.data.tables || {})) throw new Error('资料包保存后读取核对失败，请刷新后检查，避免重复提交')
      setPackets(refreshed.data || []); setPacket(saved); setForm(packetForm(saved)); setDirty(false)
      toast('会诊资料包已保存并重新读取核对')
    } catch (error) { toast(error.message || '保存失败', 'error') }
    finally { setBusy(false) }
  }
  const review = async () => {
    if (dirty) return toast('请先保存修改', 'error')
    setBusy(true)
    try { const result = await staffAPI.reviewMdtPacket(patientId, packet._id, packet.__v); setPacket(result.data); setForm(prev => ({ ...prev, version: result.data.__v })); await load(); toast('已审核，可预览打印') }
    catch (error) { toast(error.message || '审核失败', 'error') }
    finally { setBusy(false) }
  }
  const organize = async () => {
    if (dirty) return toast('请先保存会诊目标和资料选择', 'error')
    setBusy(true)
    try {
      const result = await staffAPI.organizeMdtPacket(patientId, packet._id, packet.__v)
      const prefill = newForm(user, medications).sections
      setForm(prev => ({ ...prev,
        sections: Object.fromEntries(Object.entries(prev.sections).map(([key, value]) =>
          [key, result.data.sections?.[key] && (!value || value === prefill[key]) ? result.data.sections[key] : value])),
        tables: Object.fromEntries(TABLES.map(([key]) => [key, prev.tables?.[key]?.length ? prev.tables[key] : (result.data.tables?.[key] || [])])),
      }))
      setDirty(true)
      toast('已填充资料草稿，请逐项核对并保存')
    } catch (error) { toast(error.message || 'AI整理失败', 'error') }
    finally { setBusy(false) }
  }
  const addReport = id => {
    update({ selectedReportIds: form.selectedReportIds.includes(id) ? form.selectedReportIds.filter(item => item !== id) : [...form.selectedReportIds, id] })
  }
  const basic = packet?.basicSnapshot || {}
  const printable = !!packet && packet.status === 'reviewed' && !dirty
  const print = async () => {
    try {
      const result = await staffAPI.getMdtPackets(patientId)
      const latest = (result.data || []).find(row => row._id === packet._id)
      if (!latest || latest.__v !== packet.__v || latest.status !== 'reviewed') return toast('资料包已更新，请重新打开并审核后打印', 'error')
      window.print()
    } catch (error) { toast(error.message || '打印前核对失败', 'error') }
  }
  return <div className="mdt-workspace">
    <div className="card mdt-controls">
      <div className="card-header"><div><div className="card-title">多学科会诊资料包</div><div className="mdt-hint">从档案带出基本信息；选择相关的已审核报告，补充会诊问题，审核后打印。</div></div></div>
      <div className="card-body">
        <div className="mdt-toolbar"><select className="form-input" value={packet?._id || ''} onChange={event => {
          const row = packets.find(item => item._id === event.target.value)
          if (row) choose(row)
          else { setPacket(null); setForm(newForm(user, medications)); setDirty(false) }
        }}><option value="">新建会诊资料包</option>{packets.map(row => <option key={row._id} value={row._id}>{row.title} · {row.status === 'reviewed' ? '已审核' : '草稿'} · {String(row.updatedAt || '').slice(0, 10)}</option>)}</select>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? '处理中…' : '保存草稿'}</button>
          <button className="btn btn-secondary" disabled={busy} onClick={importSource}>从档案带入资料</button>
          {packet && <button className="btn btn-secondary" disabled={busy || dirty} onClick={organize}>通义千问生成草稿</button>}
          {packet && ['familyDoctor', 'superadmin'].includes(staff?.role) && <button className="btn btn-secondary" disabled={busy || dirty || packet.status === 'reviewed'} onClick={review}>审核资料包</button>}
          <button className="btn btn-secondary" disabled={!printable} onClick={print}>打印 / 保存为 PDF</button>
        </div>
        {!loaded && <div className="mdt-hint">正在加载已有资料包…</div>}
        <p className="mdt-hint">操作顺序：选择报告 → 点“从档案带入资料”读取专病时间轴、用药和报告 → 核对并保存；需要整理诱因及会诊问题时，再点“通义千问生成草稿”并重新保存。基本信息在保存时生成快照。</p>
        <p className="mdt-hint">通义千问须有客户对应授权，只填空白摘要和空表。生成及带入的事实均标为待核实；请对照原始资料核对结果、用药状态和来源日期。未记录不等于“无”。</p>
        <div className="mdt-form-row"><label>会诊主题<input className="form-input" value={form.title} onChange={e => update({ title: e.target.value })} placeholder="例如：反复眩晕多学科会诊" /></label><label>会诊日期<input className="form-input" type="date" value={form.consultationDate} onChange={e => update({ consultationDate: e.target.value })} /></label><label>参与学科<input className="form-input" value={form.disciplines} onChange={e => update({ disciplines: e.target.value })} placeholder="耳鼻喉科、神经内科" /></label></div>
        <details className="mdt-reports" open><summary>选择本次相关的已审核报告（已选 {form.selectedReportIds.length} 份）</summary>
          {!availableReports.length && <p>暂无可选的已审核报告。</p>}
          {availableReports.map(row => <label key={row._id}><input type="checkbox" checked={form.selectedReportIds.includes(String(row._id))} onChange={() => addReport(String(row._id))} /> {reportDate(row)} · {row.title}</label>)}
          {form.selectedReportIds.length > 30 && <p>一次最多选择30份报告，请缩小到本次会诊相关资料。</p>}
        </details>
        <div className="mdt-fields">{FIELDS.filter(([key]) => ['goal', 'overview', 'symptoms', 'uncertainties'].includes(key)).map(([key, label, placeholder]) => <label key={key}><strong>{label}</strong><textarea className="form-input" rows={3} value={form.sections[key] || ''} placeholder={placeholder} onChange={e => section(key, e.target.value)} /></label>)}</div>
        {TABLES.map(([key, title, columns]) => <section className="mdt-table-editor" key={key}><div className="mdt-table-heading"><strong>{title}</strong><button type="button" className="btn btn-secondary" onClick={() => tableRows(key, [...(form.tables?.[key] || []), { verification: '待核实' }])}>添加一行</button></div>
          {(form.tables?.[key] || []).map((row, index) => <div className="mdt-edit-row" key={`${key}-${index}`}>
            {columns.map(([field, label]) => <label key={field}>{label}<textarea className="form-input" rows={2} value={row[field] || ''} onChange={e => tableRows(key, form.tables[key].map((item, i) => i === index ? { ...item, [field]: e.target.value } : item))} /></label>)}
            <label>来源（档案／报告）<input className="form-input" value={row.source || ''} onChange={e => tableRows(key, form.tables[key].map((item, i) => i === index ? { ...item, source: e.target.value } : item))} /></label>
            <label>来源日期<input className="form-input" value={row.sourceDate || ''} onChange={e => tableRows(key, form.tables[key].map((item, i) => i === index ? { ...item, sourceDate: e.target.value } : item))} /></label>
            <label>核对状态<select className="form-input" value={row.verification || '待核实'} onChange={e => tableRows(key, form.tables[key].map((item, i) => i === index ? { ...item, verification: e.target.value } : item))}><option>待核实</option><option>已核对</option></select></label>
            <button type="button" className="btn btn-secondary" onClick={() => tableRows(key, form.tables[key].filter((_, i) => i !== index))}>删除本行</button>
          </div>)}
          {!form.tables?.[key]?.length && <div className="mdt-hint">暂无记录，可人工添加或先保存会诊目标后让通义千问生成草稿。</div>}
        </section>)}
        {(form.sections.timeline || form.sections.treatment || form.sections.questions) && <details className="mdt-legacy"><summary>补充文字记录／旧版资料包内容</summary>{[['timeline', '病程时间线'], ['treatment', '治疗与用药经过'], ['questions', '分学科问题']].map(([key, label]) => <label key={key}>{label}<textarea className="form-input" value={form.sections[key] || ''} onChange={e => section(key, e.target.value)} /></label>)}</details>}
        <div className="mdt-fields">{FIELDS.filter(([key]) => ['disciplineOpinions', 'conclusion', 'nextSteps'].includes(key)).map(([key, label, placeholder]) => <label key={key}><strong>{label}</strong><textarea className="form-input" rows={3} value={form.sections[key] || ''} placeholder={placeholder} onChange={e => section(key, e.target.value)} /></label>)}</div>
      </div>
    </div>
    {packet && <article className="mdt-print-sheet">
      <header><h1>多学科会诊资料包</h1><div>会诊主题：{show(packet.title)}　会诊日期：{show(packet.consultationDate)}　参与学科：{show(packet.disciplines)}</div></header>
      <section><h2>1. 客户基本信息</h2><div className="mdt-basic">
        <span>姓名：{show(basic.name)}</span><span>性别：{show(basic.gender)}</span><span>年龄：{show(basic.age)}</span><span>身高：{basic.height === 0 || basic.height ? `${basic.height} cm` : '未记录'}</span><span>体重：{basic.weight === 0 || basic.weight ? `${basic.weight} kg` : '未记录'}</span>
      </div>{[['已记录诊断', basic.recordedDiagnosis], ['慢性病史', basic.chronicDiseases], ['既往史', basic.pastHistory], ['手术史', basic.surgeryHistory], ['过敏史', basic.allergies], ['家族史', basic.familyHistory]].map(([label, value]) => <p key={label}><strong>{label}：</strong>{show(value)}</p>)}</section>
      <section><h2>2. 会诊目标与摘要</h2><p><strong>目标：</strong>{show(packet.sections?.goal)}</p><p><strong>病情摘要：</strong>{show(packet.sections?.overview)}</p><p><strong>当前症状与影响：</strong>{show(packet.sections?.symptoms)}</p><p><strong>待核实事项：</strong>{show(packet.sections?.uncertainties)}</p></section>
      {TABLES.map(([key, title, columns], index) => <section key={key}><h2>{index + 3}. {title}</h2>{packet.tables?.[key]?.length ? <table className="mdt-print-table"><thead><tr>{columns.map(([field, label]) => <th key={field}>{label}</th>)}<th>来源／日期</th><th>核对</th></tr></thead><tbody>{packet.tables[key].map((row, i) => <tr key={i}>{columns.map(([field]) => <td key={field}>{show(row[field])}</td>)}<td>{show(row.source)}<br />{show(row.sourceDate)}</td><td>{show(row.verification)}</td></tr>)}</tbody></table> : <div className="mdt-hint">本次未整理此表</div>}</section>)}
      {(packet.sections?.timeline || packet.sections?.treatment || packet.sections?.questions) && <section><h2>旧版及补充文字记录</h2>{[['timeline', '病程'], ['treatment', '用药治疗'], ['questions', '会诊问题']].filter(([key]) => packet.sections?.[key]).map(([key, label]) => <p key={key}><strong>{label}：</strong>{packet.sections[key]}</p>)}</section>}
      <section><h2>附件：已选报告摘要（详细结果以原件为准）</h2>{(packet.reportSnapshot || []).length ? packet.reportSnapshot.map(row => <div className="mdt-report-print" key={row.reportId}><strong>{show(row.date)} · {show(row.title)}</strong><div>机构：{show(row.institution)}</div><div>报告结论：{show(row.conclusion)}</div>{row.findings?.length > 0 && <ul>{row.findings.map((line, index) => <li key={index}>{line}</li>)}</ul>}</div>) : <div>未选择相关已审核报告</div>}</section>
      {FIELDS.slice(7).map(([key, label]) => <section key={key}><h2>{label}</h2><div className="mdt-preline">{show(packet.sections?.[key])}</div></section>)}
      <footer>资料截止：{dateText(packet.sourceCapturedAt)}　审核：{packet.reviewedByName || '待审核'}（{dateText(packet.reviewedAt)}）<br />资料由健康档案整理，打印前请核对原始报告及最新用药记录。</footer>
    </article>}
  </div>
}
