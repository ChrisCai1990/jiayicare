import React from 'react'

export function ScreeningResult({ item }) {
  const paragraphs = String(item.结果 ?? '暂无结果').split(/[；\n]+/).filter(text => text.trim())
  return <details style={{ marginTop:8 }}>
    <summary style={{ cursor:'pointer', color:'#176B4D', fontSize:13 }}>查看结果</summary>
    <div style={{ marginTop:8, overflowWrap:'anywhere', whiteSpace:'pre-wrap', lineHeight:1.7 }}>
      {item.报告 && <div style={{ color:'#65776F', marginBottom:8 }}>来源报告：{item.报告}</div>}
      {paragraphs.map((text,index) => <div key={index} style={{ padding:'7px 0', borderBottom:'1px solid #EDF2EE' }}>{text}</div>)}
      {item.备注 && <div style={{ marginTop:8 }}>备注：{item.备注}</div>}
    </div>
  </details>
}

export default function ReferralScreeningList({ records }) {
  return <section style={{ marginBottom:10, minWidth:0 }}>
    <div style={{ fontWeight:700, color:'#355E4F', marginBottom:8 }}>专项筛查 · {records.length} 项</div>
    <div style={{ display:'grid', gap:8 }}>{records.map((item,index) => <article key={index} style={{ padding:12, background:'#fff', border:'1px solid #DCE8E3', borderRadius:8, minWidth:0, overflowWrap:'anywhere' }}>
      <strong>{item.项目 || '专项筛查'}</strong>
      <div style={{ color:'#65776F', fontSize:12, marginTop:4 }}>{String(item.日期 || '日期未记录').slice(0,10)}{item.机构 ? ` · ${item.机构}` : ''}</div>
      <ScreeningResult item={item} />
    </article>)}</div>
  </section>
}
