import React, { useEffect, useState } from 'react'
import { metabolicPilotAPI as adminAPI } from '../api'

const states = { invited:'待客户确认',active:'服务中',paused:'客户已暂停',withdrawn:'已退出',completed:'本期结束' }
const box = { background:'#fff', padding:20, borderRadius:12, marginBottom:16, border:'1px solid #e1e8e4' }
export default function MetabolicPilotPage({ api = adminAPI, staffMode = false }) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [identity,setIdentity]=useState(''),[note,setNote]=useState(''),[confirmed,setConfirmed]=useState(false)
  const [reply,setReply]=useState({}),[minutes,setMinutes]=useState({})
  const load=async()=>{ try { const r=await api.get();setData(staffMode?{rows:r.data}:r.data) } catch(e){setError(e.message)} }
  useEffect(()=>{load()},[])
  const perform=async(fn)=>{if(busy)return;setBusy(true);setError('');try{await fn();await load()}catch(e){setError(e.message)}finally{setBusy(false)}}
  const rows=data?.rows||[], open=rows.filter(r=>r.help?.status==='open')
  return <div style={{padding:24,maxWidth:1100,margin:'auto',color:'#1A2B24'}}>
    <h2>体重与代谢管理 · 白名单试点</h2>
    <p>12周健康记录与自动反馈。名单独立管理；普通记录不生成每日人工任务。</p>
    {error&&<div role="alert" style={{...box,color:'#b42318'}}>{error}<button onClick={load}>重试加载</button></div>}
    {!data&&!error&&<p>正在加载…</p>}
    {data&&<>
      <div style={box}>试点客户 {rows.length} 人 · 待处理求助 {open.length} 条 · 已登记人工投入 {rows.reduce((n,r)=>n+(r.humanMinutes||0),0)} 分钟
        <button disabled={busy} onClick={load} style={{marginLeft:16}}>刷新</button>
        <p style={{color:'#64776d'}}>人工耗时为处理人实际登记值；本看板不把无求助等同于服务效果达标。最多展示200位试点客户。</p>
      </div>
      {!staffMode&&<>
        <section style={box}><h3>服务开关</h3>
          <label><input type="checkbox" checked={data.config.enabled} disabled={busy} onChange={e=>perform(()=>api.config({...data.config,enabled:e.target.checked}))}/> 启用白名单服务</label>
          <label style={{marginLeft:20}}><input type="checkbox" checked={data.config.accepting} disabled={busy} onChange={e=>perform(()=>api.config({...data.config,accepting:e.target.checked}))}/> 允许名单内客户开始入组</label>
          <p>关闭入组开关不影响已入组服务；关闭服务开关暂停自动反馈，保留记录和试点历史。没有公众开放选项。</p>
        </section>
        <form style={box} onSubmit={e=>{e.preventDefault();perform(async()=>{await api.invite({identity,eligibilityNote:note,eligibilityConfirmed:confirmed});setIdentity('');setNote('');setConfirmed(false)})}}>
          <h3>邀请试点客户</h3>
          <label>完整手机号或客户ID <input required value={identity} onChange={e=>setIdentity(e.target.value)} style={{padding:8,width:280}}/></label>
          <textarea required maxLength={500} placeholder="填写适配性核对依据、负责人员及服务范围（5—500字）" value={note} onChange={e=>setNote(e.target.value)} style={{display:'block',width:'100%',minHeight:80,margin:'12px 0'}}/>
          <label><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 已由专业人员核对适配性，并确认所属健管专员可以承接求助</label>
          <p>本期为受控体验，不自动收费、不扣减既有服务权益、不自动续订；客户自行确认后开始84天周期。暂停不延长周期。</p>
          <button disabled={busy||!confirmed}>加入白名单</button>
        </form>
      </>}
      {staffMode&&<p>数据异常继续在“日常健康数据”原监测流程处理；此处承接试点客户主动求助。页面打开期间每次刷新读取最新状态。</p>}
      {rows.length===0&&<div style={box}>暂无试点客户。默认空名单，不影响已有客户。</div>}
      {[...rows].sort((a,b)=>Number(b.help?.status==='open')-Number(a.help?.status==='open')).map(row=><section key={row._id} style={box}>
        <h3>{row.user?.name||'未命名客户'} <small>{states[row.state]} · {row.allowed?'在白名单内':'资格已撤回'}</small></h3>
        {!staffMode&&<p>{row.user?.phone} · 客户ID：{row._id}</p>}
        <p>开始：{row.startedAt?new Date(row.startedAt).toLocaleDateString():'尚未开始'}　结束：{row.endsAt?new Date(row.endsAt).toLocaleDateString():'—'}　人工投入：{row.humanMinutes||0} 分钟</p>
        {row.help?.status&&<div style={{padding:12,background:row.help.status==='open'?'#fff6e6':'#edf6f1'}}>
          <b>{row.help.status==='open'?'待处理求助':'已回复'}</b><p>{row.help.message}</p>
          {row.help.status==='open'&&<p>提交于 {new Date(row.help.requestedAt).toLocaleString()} · 已等待 {Math.max(0,Math.floor((Date.now()-new Date(row.help.requestedAt))/3600000))} 小时</p>}
          {row.help.reply&&<p>处理结果：{row.help.reply}</p>}
          {staffMode&&row.help.status==='open'&&<form onSubmit={e=>{e.preventDefault();perform(()=>api.resolve(row._id,{reply:reply[row._id],minutes:minutes[row._id],revision:row.revision}))}}>
            <textarea required maxLength={1000} value={reply[row._id]||''} onChange={e=>setReply({...reply,[row._id]:e.target.value})} placeholder="处理结果将展示给客户" style={{width:'100%',minHeight:70}}/>
            <label>实际用时（分钟）<input type="number" min="0.1" max="480" step="0.1" required value={minutes[row._id]||''} onChange={e=>setMinutes({...minutes,[row._id]:e.target.value})}/></label>
            <button disabled={busy}>保存结果并关闭本次求助</button>
          </form>}
        </div>}
        {!staffMode&&!['completed','withdrawn'].includes(row.state)&&<button disabled={busy} onClick={()=>perform(()=>api.access(row._id,row.allowed?'revoke':'restore'))}>{row.allowed?'撤回资格':'恢复资格'}</button>}
        <details><summary>服务留痕（{row.history?.length||0}）</summary>{[...(row.history||[])].reverse().map((h,i)=><p key={i}>{new Date(h.at).toLocaleString()} · {h.action} {h.note} {h.minutes?`· ${h.minutes}分钟`:''}</p>)}</details>
      </section>)}
    </>}
  </div>
}
