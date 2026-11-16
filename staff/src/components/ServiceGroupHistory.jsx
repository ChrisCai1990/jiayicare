import ChatDateCalendar from './ChatDateCalendar';
import React, { useEffect, useRef, useState } from 'react';
import { inAppServiceGroupAPI as api } from '../api';
import './ServiceGroupHistory.css';

const stamp=value=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'});
const roles={customer:'客户',healthManager:'健管专员',familyDoctor:'健康顾问',nutritionist:'营养师',medicalAssistant:'就医专员',specialist:'专科医师',ai:'AI健康管家'};
export default function ServiceGroupHistory({group,onClose}) {
  const [calendarOpen,setCalendarOpen]=useState(false);
  const [filters,setFilters]=useState({q:'',date:'',kind:'all'});
  const [rows,setRows]=useState([]),[context,setContext]=useState(null),[next,setNext]=useState(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const request=useRef(0),applied=useRef({}),firstInput=useRef(null),anchor=useRef(null);
  const run=async(more=false,override={})=>{
    const serial=++request.current;
    setBusy(true);setError('');setContext(null);
    const query=more?applied.current:{...filters,...override};
    if(!more){applied.current=query;setRows([]);setNext(null);}
    try {
      const result=await api.history(group.id,{...query,...(more?{before:next}:{})});
      if(serial!==request.current)return;
      setRows(old=>more?[...old,...result.data]:result.data);
      setNext(result.hasMore?result.nextBefore:null);
    }catch(e){if(serial===request.current)setError(e.message || '查询失败，请重试');}
    finally{if(serial===request.current)setBusy(false);}
  };
  const openContext=async(id)=>{
    const serial=++request.current;setBusy(true);setError('');
    try {const result=await api.historyContext(group.id,id);if(serial===request.current)setContext(result);}
    catch(e){if(serial===request.current)setError(e.message||'对话读取失败');}
    finally{if(serial===request.current)setBusy(false);}
  };
  useEffect(()=>{const previous=document.activeElement;firstInput.current?.focus();run();return()=>{request.current++;previous?.focus?.();};},[group.id]);
  useEffect(()=>{anchor.current?.scrollIntoView({block:'center'});},[context]);
  const keyDown=e=>{
    if(e.key==='Escape')onClose();
    if(e.key==='Tab') {
      const items=[...e.currentTarget.querySelectorAll('button,input,select,a[href]')].filter(n=>!n.disabled);
      if(e.shiftKey&&document.activeElement===items[0]){e.preventDefault();items.at(-1)?.focus();}
      else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0]?.focus();}
    }
  };
  return <div className="gh-overlay" onClick={onClose}>
    <section className="gh-panel" role="dialog" aria-modal="true" aria-label="查找聊天记录" onKeyDown={keyDown} onClick={e=>e.stopPropagation()}>
      <header><div><h2>查找聊天记录</h2><small>{group.name}</small></div><button onClick={onClose} aria-label="关闭聊天记录查询">关闭</button></header>
      <form onSubmit={e=>{e.preventDefault();run();}}>
        <input ref={firstInput} aria-label="聊天关键词" value={filters.q} maxLength={80} placeholder="输入聊天关键词" onChange={e=>setFilters({...filters,q:e.target.value})}/>
        <div className="gh-controls">
          <button type="button" onClick={()=>setCalendarOpen(!calendarOpen)}>{filters.date||'日期'}</button>
          {filters.date&&<button type="button" onClick={()=>{setFilters({...filters,date:''});run(false,{date:''});}}>清除日期</button>}
          <label>类型<select aria-label="类型" value={filters.kind} onChange={e=>setFilters({...filters,kind:e.target.value})}><option value="all">全部</option><option value="text">文字</option><option value="image">图片</option><option value="file">文件（PDF）</option></select></label>
          <button disabled={busy} type="submit">查找</button>
        </div>
        {calendarOpen&&<ChatDateCalendar value={filters.date} onCancel={()=>setCalendarOpen(false)} onConfirm={date=>{setFilters({...filters,date});setCalendarOpen(false);run(false,{date});}}/>}
      </form>
      {error&&<p role="alert" className="gh-error">{error}</p>}
      {context&&<div className="gh-context-title"><button onClick={()=>setContext(null)}>返回搜索结果</button><small>原消息及前后各最多20条对话</small></div>}
      <div className="gh-results" aria-busy={busy}>
        {busy&&<p role="status">正在读取…</p>}
        {!busy&&!(context?.data || rows).length&&<p>未找到聊天记录，请调整关键词、日期或类型。</p>}
        {(context?.data || rows).map(message=><article key={message.id} ref={String(message.id)===String(context?.anchorId)?anchor:null} className={String(message.id)===String(context?.anchorId)?'gh-anchor':''}>
          <small>{message.senderName} · {roles[message.senderRole] || '服务成员'} · {stamp(message.createdAt)}</small>
          <p>{message.content}</p>
          {message.material&&<div><small>{message.material.title} · {message.material.status}</small>
            <div className="gh-files">{(message.material.files||[]).map((url,i)=><a key={i} href={url} target="_blank" rel="noreferrer">{message.material.mimeType==='application/pdf'?'查看PDF原件':<img src={url} alt={`资料第${i+1}页`}/>}</a>)}</div>
          </div>}
          {!context&&<button disabled={busy} onClick={()=>openContext(message.id)}>查看前后对话</button>}
        </article>)}
        {!context&&next&&<button disabled={busy} onClick={()=>run(true)}>加载更多结果</button>}
      </div>
    </section>
  </div>;
}
