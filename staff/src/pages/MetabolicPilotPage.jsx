import React, { useEffect, useRef, useState } from 'react'
import { metabolicPilotAPI } from '../api'
import './MetabolicPilotPage.css'

const labels = { invited:'待客户确认', active:'服务中', paused:'已暂停', completed:'本期结束', withdrawn:'已退出' }
const actions = { invite:'邀请入组', start:'客户开始体验', pause:'客户暂停', resume:'客户恢复', withdraw:'客户退出', revoke:'撤回资格', restore:'恢复资格', help:'客户求助', resolve:'团队回复', reflect:'阶段感受', preferences:'提醒偏好', choose:'行动选择' }
const date = value => value ? new Date(value).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'
function cycle(row) {
  if (!row.startedAt) return { percent:0, text:'等待客户自愿确认，尚未开始计时', phase:'准备入组' }
  const days = Math.max(0, Math.min(84, Math.floor((Date.now()-new Date(row.startedAt))/86400000)))
  return { percent:days/84*100, text:`已过 ${days} / 84 天 · 按自然周期计时`, phase:days<28?'观察习惯与变化':days<56?'选择适合的行动':days<84?'巩固与长期维持':'本期回顾' }
}
export default function MetabolicPilotPage({ api = metabolicPilotAPI }) {
  const [rows,setRows]=useState([]), [loaded,setLoaded]=useState(false), [loading,setLoading]=useState(false)
  const [error,setError]=useState(''), [notice,setNotice]=useState(''), [updated,setUpdated]=useState(null)
  const [filter,setFilter]=useState('open'), [query,setQuery]=useState(''), [selected,setSelected]=useState(null)
  const [reply,setReply]=useState(''), [minutes,setMinutes]=useState(''), [busy,setBusy]=useState(false)
  const generation=useRef(0), submitting=useRef(false)
  const load=async()=>{
    setSelected(null);setReply('');setMinutes('')
    const version=++generation.current; setLoading(true); setError('')
    try { const result=await api.get(); if(version!==generation.current)return; setRows(result.data||[]);setLoaded(true);setUpdated(new Date()) }
    catch(e){if(version===generation.current)setError(e.message||'加载失败，请重试')}
    finally{if(version===generation.current)setLoading(false)}
  }
  useEffect(()=>{load();return()=>{generation.current++}},[])
  const open=rows.filter(r=>r.help?.status==='open')
  const visible=rows.filter(r=>(filter==='all'||(filter==='open'?r.help?.status==='open':r.state===filter))&&(!query.trim()||(r.user?.name||'').includes(query.trim())))
    .sort((a,b)=>Number(b.help?.status==='open')-Number(a.help?.status==='open')||new Date(a.help?.requestedAt||a.createdAt)-new Date(b.help?.requestedAt||b.createdAt))
  const current=visible.find(r=>r._id===selected)||null
  const select=id=>{setSelected(id);setReply('');setMinutes('');setNotice('')}
  const resolve=async e=>{
    e.preventDefault();if(submitting.current||!current)return
    const amount=Number(minutes)
    if(!reply.trim()||!Number.isFinite(amount)||amount<=0||amount>480){setError('请填写处理结果及0—480分钟内的实际用时（不含0）');return}
    submitting.current=true;setBusy(true);setError('');setNotice('')
    try{await api.resolve(current._id,{reply:reply.trim(),minutes:amount,revision:current.revision});setReply('');setMinutes('');setNotice('回复已保存，客户可在体验卡中查看。');await load()}
    catch(e){setError(e.message||'保存失败，请刷新核对后重试')}
    finally{submitting.current=false;setBusy(false)}
  }
  return <div className="metabolic-workbench">
    <header className="mw-header"><div><div className="mw-eyebrow">健康管理 / 受控试点</div><h1>体重与代谢管理 <span className="mw-tag">白名单</span></h1><p>系统负责日常反馈，你只需关注需要团队帮助的客户。</p></div><div className="mw-refresh"><button className="mw-button mw-secondary" disabled={loading||busy} onClick={load}>{loading?'更新中…':'刷新工作台'}</button><small>{updated?`更新于 ${date(updated)}`:'仅显示分配给你的客户'}</small></div></header>
    {error&&<div className="mw-alert" role="alert">{error}<button disabled={busy||loading} onClick={load}>重新加载</button></div>}
    {notice&&<div className="mw-notice" role="status">{notice}</div>}
    <section className="mw-metrics" aria-label="试点概览">{[
      ['待处理求助',open.length,'优先查看客户的问题','attention'],
      ['服务中',rows.filter(r=>r.state==='active'&&r.allowed).length,'普通记录无需逐条人工回复',''],
      ['已暂停',rows.filter(r=>r.state==='paused').length,'尊重客户自主调整节奏',''],
      ['人工投入',rows.reduce((sum,r)=>sum+(r.humanMinutes||0),0),'已登记的处理时长 · 分钟',''],
    ].map(([title,value,hint,tone])=><article className={`mw-metric ${tone}`} key={title}><span>{title}</span><strong>{loaded?value:'—'}</strong><small>{hint}</small></article>)}</section>
    <div className="mw-toolbar"><div className="mw-tabs" role="group" aria-label="客户筛选">{[['open',`待处理 ${open.length}`],['all',`全部客户 ${rows.length}`],['active','服务中'],['paused','已暂停'],['completed','本期结束']].map(([key,label])=><button key={key} aria-pressed={filter===key} disabled={busy} className={filter===key?'selected':''} onClick={()=>{setFilter(key);select(null)}}>{label}</button>)}</div><input aria-label="搜索客户姓名" placeholder="搜索客户姓名" value={query} disabled={busy} onChange={e=>{setQuery(e.target.value);select(null)}}/></div>
    {!loaded&&loading?<div className="mw-empty" role="status">正在加载客户和求助…</div>:loaded&&!rows.length?<section className="mw-empty"><div className="mw-empty-icon">＋</div><h2>试点准备就绪，等待首位客户加入</h2><p>请由管理员确认客户适配性、服务期及健管归属后添加白名单。<br/>客户自愿开始体验后，会出现在这里。</p><div className="mw-steps"><span>01 管理员邀请</span><span>02 客户确认开始</span><span>03 系统反馈 · 团队承接求助</span></div></section>:loaded?<div className="mw-content"><section className="mw-list" aria-label="客户列表">{!visible.length?<div className="mw-list-empty"><h3>{query?'没有匹配的客户':'当前没有待处理事项'}</h3><p>没有求助不代表已经达到健康目标。</p><button className="mw-button mw-secondary" onClick={()=>{setQuery('');setFilter('all')}}>查看全部客户</button></div>:visible.map(row=><button className={`mw-person ${selected===row._id?'selected':''}`} key={row._id} disabled={busy} onClick={()=>select(row._id)}><div className="mw-person-top"><strong>{row.user?.name||'未命名客户'}</strong><span className={`mw-badge ${row.help?.status==='open'?'pending':''}`}>{row.help?.status==='open'?'待处理求助':labels[row.state]||'待核对'}</span></div><p>{row.help?.status==='open'?row.help.message:row.goal||'观察体重变化，找到适合的健康习惯'}</p><small>{row.help?.status==='open'?`提交于 ${date(row.help.requestedAt)}`:cycle(row).phase}{!row.allowed?' · 资格已撤回':''}</small></button>)}</section>
      <section className="mw-detail" aria-label="客户服务详情">{!current?<div className="mw-detail-placeholder"><span>◎</span><h2>选择客户，查看服务进展</h2><p>查看求助与已有回复，再决定是否需要人工介入。<br/>数据异常仍在「日常健康数据」中处理。</p><a href="/daily-checkin">前往日常健康数据 →</a></div>:<>
        <div className="mw-detail-title"><div><h2>{current.user?.name||'未命名客户'}</h2><p>{labels[current.state]}{!current.allowed?' · 资格已撤回':''}</p></div><span className="mw-tag">12周体验</span></div>
        <section className="mw-cycle"><div><strong>{cycle(current).phase}</strong><small>{cycle(current).text}</small></div><div className="mw-progress" role="progressbar" aria-label="自然周期进度，不代表服务完成率" aria-valuenow={Math.round(cycle(current).percent)} aria-valuemin={0} aria-valuemax={100}><span style={{width:`${cycle(current).percent}%`}}/></div><div className="mw-cycle-dates"><span>开始 {date(current.startedAt)}</span><span>结束 {date(current.endsAt)}</span></div></section>
        {current.help?.status?<section className="mw-help"><h3>{current.help.status==='open'?'客户需要帮助':'最近一次处理结果'}</h3><p className="mw-message">{current.help.message}</p><small>提交于 {date(current.help.requestedAt)}</small>{current.help.reply&&<div className="mw-reply"><strong>团队回复</strong><p>{current.help.reply}</p><small>{date(current.help.closedAt)} · 回复可由客户查看，未代表已读确认</small></div>}
        {current.help.status==='open'&&<form onSubmit={resolve}><label htmlFor="mw-reply">处理结果 <span>保存后向客户展示</span></label><textarea id="mw-reply" required maxLength={1000} value={reply} disabled={busy} onChange={e=>setReply(e.target.value)} placeholder="说明已采取的措施，以及客户下一步可以怎么做…"/><div className="mw-form-bottom"><label htmlFor="mw-minutes">实际用时（分钟）<input id="mw-minutes" required type="number" min="0.1" max="480" step="0.1" value={minutes} disabled={busy} onChange={e=>setMinutes(e.target.value)}/></label><button className="mw-button" disabled={busy||!reply.trim()||!minutes}>{busy?'正在保存…':'发送回复并结束本次求助'}</button></div></form>}</section>:<div className="mw-neutral">客户尚未提交求助。日常记录由系统自动反馈，无需创建每日人工任务。</div>}
        <details className="mw-history"><summary>查看服务留痕 · {current.history?.length||0}条</summary>{[...(current.history||[])].reverse().map((event,index)=><div key={index}><small>{date(event.at)}</small><strong>{actions[event.action]||event.action}</strong>{event.note&&<p>{event.note}</p>}{event.minutes>0&&<small>实际用时 {event.minutes} 分钟</small>}</div>)}</details>
      </>}</section></div>:null}
    <footer className="mw-footer">当前最多展示200位授权客户。周期进度不等于疗效或闭环完成率；异常监测与紧急情况沿用原处理流程。</footer>
  </div>
}
