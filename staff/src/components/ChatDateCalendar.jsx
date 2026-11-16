import React,{useState} from 'react';
export default function ChatDateCalendar({value,onConfirm,onCancel}) {
  const initial=value||new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  const [year,setYear]=useState(Number(initial.slice(0,4))),[month,setMonth]=useState(Number(initial.slice(5,7))),[chosen,setChosen]=useState(value||'');
  const years=Array.from({length:101},(_,i)=>new Date().getFullYear()+1-i);
  const days=new Date(year,month,0).getDate(),blank=(new Date(year,month-1,1).getDay()+6)%7;
  const cells=[...Array(blank).fill(null),...Array.from({length:days},(_,i)=>i+1)];
  const dayValue=day=>`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return <div className="gh-calendar" role="group" aria-label="选择发送日期">
    <h3>选择发送日期</h3>
    <div className="gh-calendar-month"><select aria-label="年份" value={year} onChange={e=>setYear(Number(e.target.value))}>{years.map(y=><option key={y} value={y}>{y}年</option>)}</select><select aria-label="月份" value={month} onChange={e=>setMonth(Number(e.target.value))}>{Array.from({length:12},(_,i)=><option key={i} value={i+1}>{i+1}月</option>)}</select></div>
    <div className="gh-calendar-grid">{['一','二','三','四','五','六','日'].map(d=><span key={d}>{d}</span>)}{cells.map((d,i)=>d?<button key={i} type="button" aria-label={dayValue(d)} aria-pressed={chosen===dayValue(d)} className={chosen===dayValue(d)?'selected':''} onClick={()=>setChosen(dayValue(d))}>{d}</button>:<span key={i}/>)}</div>
    <div className="gh-calendar-actions"><button type="button" disabled={!chosen} onClick={()=>onConfirm(chosen)}>确定</button><button type="button" onClick={onCancel}>取消</button></div>
  </div>;
}
