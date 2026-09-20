import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'

export default function ReportClassificationQueue({ categories, onChanged }) {
  const [rows, setRows] = useState([]), [page, setPage] = useState(1), [hasMore, setHasMore] = useState(false)
  const [name, setName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState({}), [open, setOpen] = useState(false)
  const leaves = categories.filter(node => node.status === 'active' && !categories.some(child => child.parent === node._id))
  const load = async () => {
    setBusy(true); setError('')
    try { const result = await adminAPI.reportClassification(page, name); setRows(result.data); setHasMore(result.hasMore) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  useEffect(() => { if (open) load() }, [open, page])
  const confirm = async row => {
    const key = `${row.reportId}:${row.item.itemId}`
    setBusy(true); setError('')
    try {
      await adminAPI.confirmReportClassification({ reportId: row.reportId, itemId: row.item.itemId, expectedRevision: row.reviewRevision, categoryId: selected[key] })
      await load(); onChanged()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <section style={{ marginBottom: 20 }}>
    <button className="btn btn-secondary" onClick={() => setOpen(!open)}>{open ? '收起' : '打开'}报告归类维护</button>
    {open && <div style={{ padding: 12, border: '1px solid #ddd', marginTop: 8 }}>
      <p>确认后复用相同名称、栏目、标本、部位、方式及单位的匹配。名称不同的表达可关联同一个已有分类，无需新建分类。</p>
      <input placeholder="输入项目原名查找，包括已归类项目" value={name} onChange={e => setName(e.target.value)} />
      <button disabled={busy} onClick={() => { if (page === 1) load(); else setPage(1) }}>查询</button>
      {error && <p role="alert" style={{ color: '#c33' }}>{error}</p>}
      {rows.map(row => {
        const key = `${row.reportId}:${row.item.itemId}`
        return <div key={key} style={{ borderBottom: '1px solid #eee', padding: '10px 0' }}>
          <strong>{row.item.name}</strong> · {row.title} · 第{row.item.sourcePage || '?'}页
          <div>{[row.item.orderName, row.item.sourceSection, row.item.specimen, row.item.modality, row.item.bodyPart, row.item.unit].filter(Boolean).join(' / ')}</div>
          <div style={{ whiteSpace: 'pre-wrap' }}>{row.item.value || row.item.findings} {row.item.diagnosis}</div>
          <select value={selected[key] || ''} onChange={e => setSelected(current => ({ ...current, [key]: e.target.value }))}>
            <option value="">选择 admin 已维护的末级分类</option>
            {leaves.map(node => <option key={node._id} value={node._id}>{categories.find(parent => parent._id === node.parent)?.name} / {node.name}</option>)}
          </select>
          <button disabled={busy || !selected[key] || !row.item.itemId} onClick={() => confirm(row)}>确认并复用</button>
        </div>
      })}
      {!rows.length && !busy && <p>没有待处理项目</p>}
      <button disabled={busy || page <= 1} onClick={() => setPage(page - 1)}>上一页</button> 第{page}页 <button disabled={busy || !hasMore} onClick={() => setPage(page + 1)}>下一页</button>
      <details><summary>已确认的匹配规则（撤销只影响后续匹配）</summary>
        {categories.flatMap(node => (node.confirmedRules || []).map(rule => <div key={rule._id}>
          {node.name} ← {[rule.name, rule.orderName, rule.sourceSection, rule.specimen, rule.modality, rule.bodyPart, rule.unit].filter(Boolean).join(' / ')}
          <button disabled={busy} onClick={async () => { setBusy(true); try { await adminAPI.removeClassificationRule(node._id, rule._id); onChanged() } catch (e) { setError(e.message) } finally { setBusy(false) } }}>撤销</button>
        </div>))}
      </details>
    </div>}
  </section>
}
