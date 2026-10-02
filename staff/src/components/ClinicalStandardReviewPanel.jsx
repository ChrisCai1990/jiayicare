import React, { useEffect, useState } from 'react'
import { staffAPI } from '../api'
import { useStaff } from '../App'

const muted = { color: '#667085', fontSize: 13, lineHeight: 1.6 }
const card = { border: '1px solid #e1e9e5', borderRadius: 14, padding: 18, marginTop: 14, background: '#fff' }
const domesticLabel = { primary: '国内直接依据', adopted: '国内已采用', comparison: '国内对照依据', review_required: '国内适用性待复核', unverified: '国内依据待补', internal: '内部规则' }

export default function ClinicalStandardReviewPanel() {
  const { staff } = useStaff()
  const [items, setItems] = useState([])
  const [notes, setNotes] = useState({})
  const [verified, setVerified] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const load = () => staffAPI.clinicalStandardUpdates().then(r => setItems(r.data || [])).catch(e => { if (e.status !== 403) setError(e.message) })
  useEffect(() => { if (staff?.role === 'familyDoctor') load() }, [staff?.role])
  if (staff?.role !== 'familyDoctor' || (!items.length && !error)) return null

  const review = async (id, action) => {
    setBusy(id); setError('')
    try {
      await staffAPI.reviewClinicalStandardUpdate(id, { action, note: notes[id] || '', sourceVerified: verified[id] === true })
      await load()
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  return <section className="card" style={{ padding: 22, marginBottom: 20 }}>
    <h2 style={{ fontSize: 20, margin: 0 }}>临床标准更新审核 <small>· {items.length} 项</small></h2>
    <p style={muted}>先核对原件与现行规则，再记录差异。审核结果进入实施队列，不会自动改变客户分级。</p>
    {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
    {items.map(item => {
      const standard = item.standard || {}
      const missing = standard.evidence === 'missing' || !standard.originalUrl
      const ready = !missing && verified[item._id] === true && (notes[item._id] || '').trim().length >= 10 && busy !== item._id
      return <article key={item._id} style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div><strong style={{ fontSize: 16 }}>{standard.title || item.standardId}</strong><div style={muted}>现行版本：{standard.version || '待核对'} · {item.trigger === 'source_changed' ? '监测页面有变化' : item.trigger === 'baseline_review' ? '首次核对' : '定期复核'} · 发现于 {new Date(item.detectedAt).toLocaleString('zh-CN')}</div></div>
          <span style={{ alignSelf: 'start', borderRadius: 20, padding: '5px 11px', color: missing ? '#9a3412' : '#116a51', background: missing ? '#fff1e8' : '#e8f5ee', fontSize: 12, fontWeight: 700 }}>{standard.origin || '出处待核对'}</span>
        </div>
        <div style={{ background: '#f7faf8', borderRadius: 10, padding: 14, marginTop: 12, ...muted }}>
          <div><strong>依据性质：</strong>{domesticLabel[standard.domesticStatus] || '待核对'}。{standard.domesticNote || ''}</div>
          <div><strong>国内依据（优先）：</strong>{standard.domesticSourceUrl ? <a href={standard.domesticSourceUrl} target="_blank" rel="noopener noreferrer">查看国内原文 ↗</a> : '未找到可核对原件'}</div>
          <div><strong>{standard.origin === '海外' ? '国际原版（补充）' : '原始出处'}：</strong>{standard.originalUrl ? <a href={standard.originalUrl} target="_blank" rel="noopener noreferrer">打开原文或官方手册 ↗</a> : '未归档可核对原件'}{standard.sourceUrl && standard.sourceUrl !== standard.originalUrl && <> · <a href={standard.sourceUrl} target="_blank" rel="noopener noreferrer">查看监测来源 ↗</a></>}</div>
          <div><strong>现行系统规则摘要：</strong>{standard.currentRule || '待补充'}</div>
          {standard.evidenceNote && <div style={{ color: '#9a3412' }}><strong>核对提示：</strong>{standard.evidenceNote}</div>}
          <div style={{ fontSize: 12 }}>规则实现：{standard.implementation || '待定位'}。以上摘要来自现行代码，不代替原文。</div>
        </div>
        {missing ? <p style={{ color: '#9a3412', fontSize: 13 }}>缺少原件，审核暂不可提交。请由机构管理员补齐签发文件或可访问的官方出处。</p> : <>
          <label style={{ display: 'block', marginTop: 14, fontSize: 13 }}><input type="checkbox" checked={verified[item._id] === true} onChange={e => setVerified(v => ({ ...v, [item._id]: e.target.checked }))} /> 我已核对国内依据{standard.origin === '海外' ? '、国际原版' : ''}与现行规则的适用差异{standard.evidence === 'restricted' ? '（含手册访问权限）' : ''}</label>
          <textarea className="form-input" rows={3} maxLength={2000} placeholder="记录版次、变化点及现行规则是否需要调整（至少10字）" value={notes[item._id] || ''} onChange={e => setNotes(v => ({ ...v, [item._id]: e.target.value }))} style={{ display: 'block', width: '100%', boxSizing: 'border-box', margin: '10px 0' }} />
          <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-primary btn-sm" disabled={!ready} onClick={() => review(item._id, 'clinically_reviewed')}>确认需评估实施</button><button className="btn btn-secondary btn-sm" disabled={!ready} onClick={() => review(item._id, 'dismissed')}>无需更新</button></div>
        </>}
      </article>
    })}
  </section>
}
