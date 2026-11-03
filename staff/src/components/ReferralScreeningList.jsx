import React, { useState } from 'react'
import { screeningView, referenceLines, screeningStatus, groupScreenings, screeningProjects } from '../utils/referralScreeningView.mjs'

function StatusBadge({ row }) {
  const status = screeningStatus(row)
  return status.label ? <span title={status.source} style={{ marginLeft:8, fontSize:12, color:status.abnormal ? '#B42318' : '#8A5A00', fontWeight:700 }}>{status.label}</span> : null
}
function Reference({ value }) {
  if (!value) return '未记录'
  return String(value).length <= 24 && referenceLines(value).length === 1 ? <span>{value}</span> : <details><summary style={{ cursor:'pointer', color:'#176B4D' }}>查看参考范围</summary>{referenceLines(value).map((line,j)=><div key={j} style={{ paddingTop:5 }}>{line}</div>)}</details>
}
const cell = { padding:'10px 12px', textAlign:'left', verticalAlign:'top', borderBottom:'1px solid #E3ECE7', overflowWrap:'anywhere' }
function TextBlock({ title, children }) { return children ? <div style={{ marginTop:10 }}><b style={{ color:'#355E4F' }}>{title}</b><div style={{ whiteSpace:'pre-wrap', marginTop:4 }}>{children}</div></div> : null }
export function ScreeningResult({ item, expanded = false }) {
  const view = screeningView(item)
  const abnormalCount = view.rows.filter(row => screeningStatus(row).abnormal).length
  const labs = view.rows.filter(r => r.value !== '' && r.value != null)
  const texts = view.rows.filter(r => r.findings || r.conclusion || (r.value === '' && r.name))
  return <details open={expanded} style={{ marginTop:8 }}>
    <summary style={{ cursor:'pointer', color:'#176B4D', fontSize:13 }}>查看结果{abnormalCount > 0 && <span style={{ marginLeft:10, color:'#B42318', fontWeight:700 }}>{abnormalCount} 项异常</span>}</summary>
    <div style={{ marginTop:8, overflowWrap:'anywhere', lineHeight:1.7 }}>
      {item.报告 && <div style={{ color:'#65776F', marginBottom:8 }}>来源报告：{item.报告}</div>}
      {!!labs.length && <div style={{ overflowX:'auto' }}><table style={{ width:'100%', minWidth:480, borderCollapse:'collapse', tableLayout:'fixed', fontSize:13 }}>
        <thead style={{ background:'#EFF5F2', color:'#355E4F' }}><tr>{['检查指标','本次结果','单位','参考范围'].map((label,i) => <th key={label} style={{ ...cell, width:[36,18,16,30][i]+'%' }}>{label}</th>)}</tr></thead>
        <tbody>{labs.map((r,i) => { const status=screeningStatus(r); return <tr key={i} style={{ background:status.abnormal ? '#FFF5F4' : undefined }}><td style={{ ...cell, color:status.abnormal ? '#B42318' : undefined }}>{r.name}</td><td style={{ ...cell, fontWeight:700, color:status.abnormal ? '#B42318' : undefined }}>{String(r.value)}<StatusBadge row={r} /></td><td style={cell}>{r.unit || '未记录'}</td><td style={cell}><Reference value={r.referenceRange} /></td></tr> })}</tbody>
      </table></div>}
      {texts.map((r,i)=><div key={i} style={{ padding:'10px 0', borderBottom:'1px solid #E3ECE7' }}><strong>{r.name}</strong><StatusBadge row={r} /><TextBlock title="检查所见">{r.findings}</TextBlock><TextBlock title="报告结论">{r.conclusion}</TextBlock></div>)}
      <TextBlock title="检查所见">{view.findings}</TextBlock><TextBlock title="报告结论">{view.conclusion}</TextBlock>
      {!!view.notes.length && <TextBlock title="原报告结果">{view.notes.join('；\n')}</TextBlock>}
      <TextBlock title="备注">{item.备注}</TextBlock>
    </div>
  </details>
}
export default function ReferralScreeningList({ records }) {
  const [search,setSearch] = useState('')
  const [category,setCategory] = useState('all')
  const categories = groupScreenings(records).map(group => ({ ...group, projects:screeningProjects(group.items) }))
  const matches = project => project.items.some(r => [r.项目,r.报告,r.日期,r.机构].some(v => String(v || '').toLowerCase().includes(search.trim().toLowerCase())))
  const visible = categories.filter(group => category === 'all' || category === group.key).map(group => ({ ...group, projects:group.projects.filter(matches) })).filter(group => group.projects.length)
  return <section className="consultation-disclosures" style={{ marginBottom:10, minWidth:0 }}>
    <div style={{ fontWeight:700, color:'#355E4F', marginBottom:8 }}>专项筛查 · {screeningProjects(records).length} 个项目 · {records.length} 条记录</div>
    {records.length > 5 && <input className="form-input" aria-label="搜索筛查项目" placeholder="搜索项目、日期或报告名称" value={search} onChange={e=>setSearch(e.target.value)} style={{ marginBottom:10 }} />}
    <div role="group" aria-label="资料分类" style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>{[{ key:'all', label:'全部', projects:screeningProjects(records) }, ...categories].map(group => <button key={group.key} type="button" className={`btn ${category === group.key ? 'btn-primary' : 'btn-secondary'}`} aria-pressed={category === group.key} onClick={() => setCategory(group.key)}>{group.label}（{group.projects.length}）</button>)}</div>
    <p style={{ color:'#65776F', fontSize:14 }}>同一项目集中展示，展开查看历次结果（最新在前）。</p>
    {!visible.length && <div>没有匹配的筛查项目</div>}
    {visible.map(group => <section key={group.key} style={{ marginBottom:18 }}><h4 style={{ margin:'10px 0', color:'#355E4F' }}>{group.label} · {group.projects.length} 个项目</h4><div style={{ display:'grid', gap:8 }}>{group.projects.map(project => {
      const abnormalCount = project.items.reduce((sum,item) => sum + screeningView(item).rows.filter(row => screeningStatus(row).abnormal).length, 0)
      return <details key={project.key} style={{ padding:12, background:'#fff', border:'1px solid #DCE8E3', borderRadius:8, minWidth:0, overflowWrap:'anywhere' }}>
        <summary style={{ cursor:'pointer', fontSize:16 }}><strong>{project.name}</strong><span style={{ color:'#65776F', marginLeft:12 }}>{project.items.length} 条记录</span>{abnormalCount > 0 && <span style={{ color:'#B42318', marginLeft:12 }}>历次共 {abnormalCount} 项异常结果</span>}</summary>
        {project.items.map((item,index) => <article key={`${item.key || item.来源报告编号 || ''}-${index}`} style={{ borderTop:'1px solid #DCE8E3', marginTop:14, paddingTop:14 }}>
          <div style={{ color:'#355E4F', fontSize:16 }}><b>{String(item.日期 || '日期未记录').slice(0,10)}</b>{item.机构 ? ` · ${item.机构}` : ''}</div>
          <ScreeningResult item={item} expanded />
        </article>)}
      </details>
    })}</div></section>)}
  </section>
}
