import React, { useEffect, useMemo, useState } from 'react'

function visiblePages(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const sorted = [...new Set([1, total, current - 1, current, current + 1])]
    .filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
  const result = []
  sorted.forEach((page, index) => {
    if (index && page - sorted[index - 1] > 1) result.push(`gap-${page}`)
    result.push(page)
  })
  return result
}

export default function Pagination({ page, totalPages, onChange, compact = false, pageSize, pageSizeOptions = [5, 10, 20, 50], onPageSizeChange }) {
  const total = Math.max(1, Number(totalPages) || 1)
  const current = Math.min(total, Math.max(1, Number(page) || 1))
  const [target, setTarget] = useState(String(current))
  const pages = useMemo(() => visiblePages(current, total), [current, total])
  useEffect(() => setTarget(String(current)), [current])
  if (total <= 1 && !onPageSizeChange) return null

  const go = value => {
    const next = Math.min(total, Math.max(1, Number(value) || current))
    setTarget(String(next))
    if (next !== current) onChange(next)
  }
  const buttonStyle = active => ({
    minWidth: compact ? 30 : 36, height: compact ? 30 : 34,
    padding: compact ? '0 8px' : '0 11px', borderRadius: 8,
    border: `1px solid ${active ? '#1E6B50' : '#D8DED9'}`,
    background: active ? '#1E6B50' : '#fff', color: active ? '#fff' : '#35594A',
    cursor: 'pointer', fontSize: compact ? 12 : 14,
  })

  return (
    <div style={{ display:'flex', justifyContent:'center', alignItems:'center', flexWrap:'wrap', gap:6, marginTop:16 }}>
      {onPageSizeChange && (
        <label style={{ display:'inline-flex', alignItems:'center', gap:5, marginRight:6, color:'#667A70', fontSize:compact ? 12 : 14 }}>
          每页
          <select value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))}
            style={{ height:compact ? 30 : 34, border:'1px solid #D8DED9', borderRadius:8, background:'#fff', color:'#35594A', padding:'0 7px' }}>
            {pageSizeOptions.map(size => <option key={size} value={size}>{size}</option>)}
          </select>
          条
        </label>
      )}
      <button type="button" style={buttonStyle(false)} disabled={current <= 1} onClick={() => go(current - 1)}>上一页</button>
      {pages.map(item => typeof item === 'number'
        ? <button type="button" key={item} style={buttonStyle(item === current)} onClick={() => go(item)} aria-current={item === current ? 'page' : undefined}>{item}</button>
        : <span key={item} style={{ padding:'0 2px', color:'#8AA89C' }}>…</span>)}
      <button type="button" style={buttonStyle(false)} disabled={current >= total} onClick={() => go(current + 1)}>下一页</button>
      <span style={{ marginLeft:6, color:'#667A70', fontSize:compact ? 12 : 14 }}>共 {total} 页，到</span>
      <input value={target} inputMode="numeric" onChange={e => setTarget(e.target.value.replace(/\D/g, ''))}
        onKeyDown={e => { if (e.key === 'Enter') go(target) }} aria-label="跳转页码"
        style={{ width:52, height:compact ? 30 : 34, border:'1px solid #D8DED9', borderRadius:8, textAlign:'center', boxSizing:'border-box' }} />
      <span style={{ color:'#667A70', fontSize:compact ? 12 : 14 }}>页</span>
      <button type="button" style={buttonStyle(false)} onClick={() => go(target)}>跳转</button>
    </div>
  )
}
