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
const show = value => value === 0 || value ? String(value) : '未记录'
const dateText = value => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '未记录'
const reportDate = report => report.checkDate || report.reportYear || '日期未记录'
const newForm = (user, medications) => {
  const summary = user?.medicalRecord?.summary || {}
  const entries = user?.medicalRecord?.courseEntries || []
  const currentMedication = (medications || []).filter(item => item.active === true && !item.stopped)
  const stoppedMedication = (medications || []).filter(item => item.stopped || item.active === false).slice(0, 20)
  return {
    title: '', consultationDate: '', disciplines: '', selectedReportIds: [],
    sections: {
      goal: '', overview: [summary.chiefComplaint, summary.presentIllness].filter(Boolean).join('\n'),
      timeline: entries.map(item => [item.occurredAt || item.date, item.content, item.examination, item.treatmentResponse].filter(Boolean).join('：')).filter(Boolean).join('\n'),
      symptoms: (user?.healthProfile?.recentSymptoms || []).join('、'),
      treatment: [summary.currentMedication,
        ...currentMedication.map(item => `在用：${[item.name, item.dosage, item.frequency, item.startDate].filter(Boolean).join(' ')}`),
        ...stoppedMedication.map(item => `已停用：${[item.name, item.dosage, item.frequency, item.stopDate, item.stopReason].filter(Boolean).join(' ')}`),
      ].filter(Boolean).join('\n'),
      questions: '', uncertainties: '', disciplineOpinions: '', conclusion: '', nextSteps: '',
    },
  }
}

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
  const choose = row => { setPacket(row); setForm({ title: row.title, consultationDate: row.consultationDate || '', disciplines: row.disciplines || '', sections: row.sections || {}, selectedReportIds: (row.selectedReportIds || []).map(String), version: row.__v }); setDirty(false) }
  const save = async () => {
    if (!form.title.trim()) return toast('请填写会诊主题', 'error')
    setBusy(true)
    try {
      const result = packet ? await staffAPI.updateMdtPacket(patientId, packet._id, form) : await staffAPI.createMdtPacket(patientId, form)
      setPacket(result.data); setForm(prev => ({ ...prev, version: result.data.__v })); setDirty(false); await load(); toast('会诊资料包草稿已保存')
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
      setForm(prev => ({ ...prev, sections: Object.fromEntries(Object.entries(prev.sections).map(([key, value]) =>
        [key, result.data[key] && (!value || value === prefill[key]) ? result.data[key] : value])) }))
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
          {packet && <button className="btn btn-secondary" disabled={busy || dirty} onClick={organize}>AI整理空白栏目</button>}
          {packet && ['familyDoctor', 'superadmin'].includes(staff?.role) && <button className="btn btn-secondary" disabled={busy || dirty || packet.status === 'reviewed'} onClick={review}>审核资料包</button>}
          <button className="btn btn-secondary" disabled={!printable} onClick={print}>打印 / 保存为 PDF</button>
        </div>
        {!loaded && <div className="mdt-hint">正在加载已有资料包…</div>}
        <p className="mdt-hint">基本信息在保存时从健康档案生成快照；之后档案若有更新，请重新保存并审核。未记录的信息不会写成“无”。</p>
        <p className="mdt-hint">AI整理会将本次资料发送给已配置的通义千问，须有客户对应授权；只填充空白或系统预填栏目，不覆盖人工修改。结果仅是草稿。</p>
        <div className="mdt-form-row"><label>会诊主题<input className="form-input" value={form.title} onChange={e => update({ title: e.target.value })} placeholder="例如：反复眩晕多学科会诊" /></label><label>会诊日期<input className="form-input" type="date" value={form.consultationDate} onChange={e => update({ consultationDate: e.target.value })} /></label><label>参与学科<input className="form-input" value={form.disciplines} onChange={e => update({ disciplines: e.target.value })} placeholder="耳鼻喉科、神经内科" /></label></div>
        <details className="mdt-reports" open><summary>选择本次相关的已审核报告（已选 {form.selectedReportIds.length} 份）</summary>
          {!availableReports.length && <p>暂无可选的已审核报告。</p>}
          {availableReports.map(row => <label key={row._id}><input type="checkbox" checked={form.selectedReportIds.includes(String(row._id))} onChange={() => addReport(String(row._id))} /> {reportDate(row)} · {row.title}</label>)}
          {form.selectedReportIds.length > 30 && <p>一次最多选择30份报告，请缩小到本次会诊相关资料。</p>}
        </details>
        <div className="mdt-fields">{FIELDS.map(([key, label, placeholder], index) => <label key={key}><strong>{index + 1}. {label}</strong><textarea className="form-input" rows={key === 'timeline' || key === 'questions' ? 5 : 3} value={form.sections[key] || ''} placeholder={placeholder} onChange={e => section(key, e.target.value)} /></label>)}</div>
      </div>
    </div>
    {packet && <article className="mdt-print-sheet">
      <header><h1>多学科会诊资料包</h1><div>会诊主题：{show(packet.title)}　会诊日期：{show(packet.consultationDate)}　参与学科：{show(packet.disciplines)}</div></header>
      <section><h2>1. 客户基本信息</h2><div className="mdt-basic">
        <span>姓名：{show(basic.name)}</span><span>性别：{show(basic.gender)}</span><span>年龄：{show(basic.age)}</span><span>身高：{basic.height === 0 || basic.height ? `${basic.height} cm` : '未记录'}</span><span>体重：{basic.weight === 0 || basic.weight ? `${basic.weight} kg` : '未记录'}</span>
      </div>{[['已记录诊断', basic.recordedDiagnosis], ['慢性病史', basic.chronicDiseases], ['既往史', basic.pastHistory], ['手术史', basic.surgeryHistory], ['过敏史', basic.allergies], ['家族史', basic.familyHistory]].map(([label, value]) => <p key={label}><strong>{label}：</strong>{show(value)}</p>)}</section>
      {FIELDS.slice(0, 4).map(([key, label], index) => <section key={key}><h2>{index + 2}. {label}</h2><div className="mdt-preline">{show(packet.sections?.[key])}</div></section>)}
      <section><h2>6. 检查与客观证据</h2>{(packet.reportSnapshot || []).length ? packet.reportSnapshot.map(row => <div className="mdt-report-print" key={row.reportId}><strong>{show(row.date)} · {show(row.title)}</strong><div>机构：{show(row.institution)}</div><div>报告结论：{show(row.conclusion)}</div>{row.findings?.length > 0 && <ul>{row.findings.map((line, index) => <li key={index}>{line}</li>)}</ul>}</div>) : <div>未选择相关已审核报告</div>}</section>
      {FIELDS.slice(4).map(([key, label], index) => <section key={key}><h2>{index + 7}. {label}</h2><div className="mdt-preline">{show(packet.sections?.[key])}</div></section>)}
      <footer>资料截止：{dateText(packet.sourceCapturedAt)}　审核：{packet.reviewedByName || '待审核'}（{dateText(packet.reviewedAt)}）<br />资料由健康档案整理，打印前请核对原始报告及最新用药记录。</footer>
    </article>}
  </div>
}
