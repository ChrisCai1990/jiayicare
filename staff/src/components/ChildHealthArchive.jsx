import React, { useState } from 'react'
import { staffAPI } from '../api'
import childAgeStages from '../../../shared/childAgeStages.json'
import ChildStandardRecords from './ChildStandardRecords'

const stageLabel = stage => stage?.label || childAgeStages.find(item => item.id === stage?.id)?.label || '年龄段未记录'
const currentStage = birthDate => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate || '')) return null
  const birth = new Date(`${birthDate}T00:00:00Z`)
  if (Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== birthDate) return null
  const chinaTime = new Date(Date.now() + 8 * 3600000)
  const today = new Date(Date.UTC(chinaTime.getUTCFullYear(), chinaTime.getUTCMonth(), chinaTime.getUTCDate()))
  if (birth > today) return null
  const days = Math.floor((today - birth) / 86400000)
  let years = today.getUTCFullYear() - birth.getUTCFullYear()
  if (today.getUTCMonth() < birth.getUTCMonth() || (today.getUTCMonth() === birth.getUTCMonth() && today.getUTCDate() < birth.getUTCDate())) years--
  const id = days < 28 ? 'newborn' : years < 1 ? 'infant' : years < 3 ? 'toddler' : years < 6 ? 'preschool' : years < 12 ? 'school' : years < 18 ? 'adolescent' : null
  return childAgeStages.find(stage => stage.id === id) || null
}

const GROUPS = [
  ['围产与出生', [['motherAge','母亲分娩年龄'],['gravida','胎次'],['para','产次'],['motherPregnancyStatus','母亲妊娠期情况'],['deliveryComplications','产时并发情况'],['gestationalWeeks','出生孕周'],['birthWeight','出生体重'],['birthLength','出生身长'],['birthHeadCirc','出生头围'],['birthChestCirc','出生胸围'],['deliveryMode','分娩方式'],['apgar1min','Apgar 1分钟'],['apgar5min','Apgar 5分钟']]],
  ['筛查与健康史', [['neonatalConditions','新生儿期情况'],['birthDefects','出生缺陷'],['hearingScreening','听力筛查'],['eyeScreening','眼底筛查'],['visionScreening','视力筛查'],['neonatalDiseaseScreen','新生儿疾病筛查'],['familyAllergyHistory','家族过敏史'],['familyDiseaseHistory','家族疾病史'],['pastMedicalHistory','既往疾病与住院史'],['surgeries','手术史'],['allergies','过敏与不良反应自述'],['fatherHeight','父亲身高'],['motherHeight','母亲身高'],['fatherBirthDate','父亲出生日期'],['motherBirthDate','母亲出生日期']]],
  ['成长与近况', [['reportedHeightCm','最近身高/身长（监护人自报，cm）'],['reportedWeightKg','最近体重（监护人自报，kg）'],['reportedMeasuredAt','最近测量日期（监护人自报）'],['feeding','喂养与饮食'],['sleep','睡眠'],['development','生长发育与行为'],['vaccinationStatus','预防接种'],['currentMedicationReport','当前用药自述'],['currentSymptomsReport','近期不适自述'],['schoolAndActivity','托育、学校与活动'],['caregiverConcerns','监护人关注问题']]],
]
const fmt = value => value === null || value === undefined || value === '' ? '未记录' : String(value)
const EDITABLE = GROUPS.flatMap(([, fields]) => fields)

function ReviewForm({ user, submission, onSaved, canEdit }) {
  const [rows, setRows] = useState(() => (submission.items || []).map(item => ({
    path: item.path, verified: false, accept: !item.conflict,
    value: item.valueStr ?? String(item.value ?? ''),
  })))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const setRow = (index, patch) => setRows(all => all.map((row, i) => i === index ? { ...row, ...patch } : row))
  const save = async () => {
    if (!rows.every(row => row.verified)) { setError('请逐项勾选已核实'); return }
    if (!note.trim()) { setError('请填写核实依据'); return }
    setBusy(true); setError('')
    try {
      await staffAPI.reviewChildArchive(user._id, submission.responseId, { revision: submission.revision, decisions: rows, note })
      await onSaved()
    } catch (err) { setError(err.message || '保存失败，请刷新后重试') }
    finally { setBusy(false) }
  }
  return <div style={{ border: '1px solid #D8EDE3', borderRadius: 8, padding: 14, marginTop: 12, background: '#FAFCFB' }}>
    <div style={{ fontWeight: 700, color: '#1E6B50' }}>{submission.kind === 'initial' ? '首次建档待核实' : '后续问卷变化待确认'} · {submission.questionnaireTitle || '儿童健康问卷'}</div>
    <div style={{ fontSize: 12, color: '#65776F', marginTop: 4 }}>提交于 {new Date(submission.submittedAt).toLocaleString('zh-CN')} · {stageLabel(submission.ageStage)}。空字段先写入并标记待核实；与已有记录不同的回答，须经医护确认后才更新。</div>
    {(submission.items || []).map((item, index) => <div key={`${item.path}-${index}`} style={{ borderTop: '1px solid #E5EEE8', padding: '12px 0' }}>
      <div style={{ fontWeight: 600, fontSize: 13 }}>{item.label} {item.conflict && <span style={{ color: '#A65A00', fontWeight: 400 }}>· 与原档案不同</span>}</div>
      <div style={{ fontSize: 12, color: '#65776F', margin: '4px 0' }}>问卷：{item.questionText}　回答：{fmt(item.valueStr)}　原档案：{fmt(item.before)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={rows[index]?.verified || false} disabled={!canEdit} onChange={e => setRow(index, { verified: e.target.checked })} /> 已核实</label>
        <label style={{ fontSize: 13 }}><input type="checkbox" checked={rows[index]?.accept || false} disabled={!canEdit} onChange={e => setRow(index, { accept: e.target.checked })} /> 采纳到儿童档案</label>
        {rows[index]?.accept && <input className="form-input" style={{ flex: '1 1 190px', maxWidth: 360 }} type={item.fieldType === 'number' ? 'number' : 'text'} value={rows[index]?.value || ''} disabled={!canEdit} onChange={e => setRow(index, { value: e.target.value })} aria-label={`${item.label}核实值`} />}
      </div>
    </div>)}
    {submission.items?.length === 0 && <div style={{ fontSize: 13, color: '#65776F', padding: '12px 0' }}>本份问卷没有可写入的儿童档案回答，请核对原始答卷后记录核实结论。</div>}
    {canEdit && <><textarea className="form-input" rows={2} placeholder="核实依据、与监护人确认情况或暂无法确认的原因" value={note} onChange={e => setNote(e.target.value)} />
      {error && <div style={{ color: '#B42318', fontSize: 12, marginTop: 6 }}>{error}</div>}
      <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} disabled={busy} onClick={save}>{busy ? '保存中…' : '完成本次核实'}</button></>}
  </div>
}

export default function ChildHealthArchive({ user, onSaved, canEdit }) {
  const [retryBusy, setRetryBusy] = useState(false)
  const [retryError, setRetryError] = useState('')
  const [editing, setEditing] = useState(false)
  const [manual, setManual] = useState({ key: 'feeding', value: '', reason: '', clear: false })
  const [manualBusy, setManualBusy] = useState(false)
  const [manualError, setManualError] = useState('')
  if (user?.patientCategory !== 'child') return null
  const submissions = user.childArchiveSubmissions || []
  const pending = submissions.filter(row => row.status === 'pending')
  const unverifiedPaths = new Set(pending.flatMap(row => (row.items || []).filter(item => item.imported).map(item => item.path)))
  const history = user.childArchiveHistory || []
  return <section className="card core-archive" style={{ marginBottom: 16 }}>
    <div className="card-header"><div><div className="card-title">儿童健康档案</div><div style={{ fontSize: 12, color: '#65776F', marginTop: 4 }}>围产与出生、筛查与健康史、成长近况；问卷来源与人工核实记录持续保留。用药和症状自述不自动修改专业记录。</div></div></div>
    <div className="card-body">
      <div style={{ background: '#F2F8F5', padding: '9px 12px', borderRadius: 8, fontSize: 13 }}>当前年龄段：{currentStage(user.birthDate)?.label || (user.birthDate ? '已超出儿童阶段或出生日期有误，请核实' : '出生日期待核实')}。历次问卷按提交时的年龄段保存，跨阶段沿用同一份基础档案。</div>
      {user.childArchiveImportPending && <div style={{ background: '#FFF4DB', padding: 12, borderRadius: 8, marginBottom: 12 }}>儿童问卷已保存，档案承接待恢复。{canEdit && <button className="btn btn-secondary btn-sm" disabled={retryBusy} onClick={async () => { setRetryBusy(true); setRetryError(''); try { await staffAPI.retryChildArchive(user._id); await onSaved() } catch (err) { setRetryError(err.message || '恢复失败') } finally { setRetryBusy(false) } }}>重试承接</button>}{retryError && <div style={{ color: '#B42318' }}>{retryError}</div>}</div>}
      {pending.map(row => <ReviewForm key={String(row.responseId)} user={user} submission={row} onSaved={onSaved} canEdit={canEdit} />)}
      {!submissions.length && <div style={{ fontSize: 13, color: '#65776F', marginBottom: 12 }}>暂无儿童健康问卷。可在问卷管理中创建儿童问卷草稿，并由医护端推送给监护人填写。</div>}
      <ChildStandardRecords user={user} onSaved={onSaved} canEdit={canEdit} />
      {GROUPS.map(([group, fields]) => <div key={group} style={{ marginTop: 16 }}><div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{group}</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 8 }}>{fields.map(([key, label]) => <div key={key} style={{ border: '1px solid #E5EEE8', borderRadius: 6, padding: '8px 10px' }}><div style={{ fontSize: 11, color: '#65776F' }}>{label}{unverifiedPaths.has(`childProfile.${key}`) && <span style={{ color: '#A65A00', marginLeft: 5 }}>待核实</span>}</div><div style={{ fontSize: 13, marginTop: 4, overflowWrap: 'anywhere' }}>{fmt(user.childProfile?.[key])}</div></div>)}</div></div>)}
      {canEdit && <div style={{ marginTop: 16 }}><button className="btn btn-secondary btn-sm" onClick={() => { setManual(row => ({ ...row, value: String(user.childProfile?.[row.key] ?? ''), reason: '', clear: false })); setEditing(v => !v) }}>{editing ? '收起人工更新' : '人工更新儿童档案'}</button>{editing && <div style={{ border: '1px solid #D8EDE3', borderRadius: 8, padding: 12, marginTop: 10 }}>
        <div style={{ fontSize: 12, color: '#65776F', marginBottom: 8 }}>用于医护核实后的后续更新；每次只修改一个字段并记录依据。</div>
        <select className="form-input" value={manual.key} onChange={e => setManual({ key: e.target.value, value: String(user.childProfile?.[e.target.value] ?? ''), reason: '', clear: false })}>{EDITABLE.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select>
        <div style={{ fontSize: 12, color: '#65776F', marginTop: 8 }}>当前：{fmt(user.childProfile?.[manual.key])}</div>
        <input className="form-input" style={{ marginTop: 8 }} placeholder="核实后的新内容" value={manual.value} disabled={manual.clear} onChange={e => setManual(row => ({ ...row, value: e.target.value }))} />
        <label style={{ display: 'block', fontSize: 12, marginTop: 8 }}><input type="checkbox" checked={manual.clear} onChange={e => setManual(row => ({ ...row, clear: e.target.checked }))} /> 清除此字段的错误记录</label>
        <textarea className="form-input" rows={2} style={{ marginTop: 8 }} placeholder="更新依据（必填）" value={manual.reason} onChange={e => setManual(row => ({ ...row, reason: e.target.value }))} />
        {manualError && <div style={{ color: '#B42318', fontSize: 12 }}>{manualError}</div>}
        <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} disabled={manualBusy} onClick={async () => { setManualBusy(true); setManualError(''); try { await staffAPI.updateChildArchive(user._id, { path: `childProfile.${manual.key}`, value: manual.value, clear: manual.clear, reason: manual.reason, expected: user.childProfile?.[manual.key] ?? null }); setEditing(false); await onSaved() } catch (err) { setManualError(err.message || '更新失败') } finally { setManualBusy(false) } }}>{manualBusy ? '保存中…' : '保存更新'}</button>
      </div>}</div>}
      {!!submissions.length && <details style={{ marginTop: 16 }}><summary style={{ cursor: 'pointer', fontSize: 13, color: '#1E6B50' }}>儿童问卷提交记录（{submissions.length}）</summary>{[...submissions].reverse().map(row => <div key={String(row.responseId)} style={{ padding: '7px 0', borderBottom: '1px solid #E5EEE8', fontSize: 12 }}>{stageLabel(row.ageStage)} · {row.questionnaireTitle} · {new Date(row.submittedAt).toLocaleString('zh-CN')} · {row.kind === 'initial' ? '首次' : '后续'} · {row.status === 'pending' ? '待核实' : row.status === 'unchanged' ? '与当前档案无变化' : '已核实'}</div>)}</details>}
      {!!history.length && <details style={{ marginTop: 16 }}><summary style={{ cursor: 'pointer', fontSize: 13, color: '#1E6B50' }}>问卷核实与修订历史（{history.length}）</summary>{[...history].reverse().map((row, i) => <div key={i} style={{ padding: '9px 0', borderBottom: '1px solid #E5EEE8', fontSize: 12 }}><b>{row.kind === 'initial' ? '首次建档' : row.kind === 'manual' ? '人工更新' : '后续更新'}</b> · {stageLabel(row.ageStage)} · {row.questionnaireTitle || '医护核实'} · {new Date(row.reviewedAt).toLocaleString('zh-CN')} · {row.reviewedByName}<div>核实依据：{row.note}</div><div>采纳 {row.decisions?.filter(item => item.accepted).length || 0} 项，变更 {row.changes?.length || 0} 项</div>{(row.changes || []).map((change, j) => <div key={j} style={{ marginTop: 3 }}>{change.label}：{fmt(change.from)} → {fmt(change.to)}</div>)}</div>)}</details>}
    </div>
  </section>
}
