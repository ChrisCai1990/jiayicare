import React,{useState} from 'react';
import {View,Text,Picker} from '@tarojs/components';
export default function ChatDateCalendar({value,onConfirm,onCancel}) {
  const initial=value||new Date(Date.now()+8*3600000).toISOString().slice(0,10);
  const [year,setYear]=useState(Number(initial.slice(0,4))),[month,setMonth]=useState(Number(initial.slice(5,7))),[chosen,setChosen]=useState(value||'');
  const years=Array.from({length:101},(_,i)=>new Date().getFullYear()+1-i);
  const days=new Date(year,month,0).getDate(),blank=(new Date(year,month-1,1).getDay()+6)%7;
  const cells=[...Array(blank).fill(null),...Array.from({length:days},(_,i)=>i+1)];
  const dayValue=day=>`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  return <View style={{background:'#fff',padding:'16px',borderRadius:'12px',border:'1px solid #d3e2dc',margin:'10px 0'}}>
    <Text style={{display:'block',fontSize:'18px',fontWeight:600,marginBottom:'16px'}}>选择发送日期</Text>
    <View style={{display:'flex',gap:'16px',marginBottom:'14px'}}><Picker mode="selector" range={years.map(y=>y+'年')} value={years.indexOf(year)} onChange={e=>setYear(years[Number(e.detail.value)])}><Text style={{display:'block',padding:'8px'}}>{year}年 ▾</Text></Picker><Picker mode="selector" range={Array.from({length:12},(_,i)=>(i+1)+'月')} value={month-1} onChange={e=>setMonth(Number(e.detail.value)+1)}><Text style={{display:'block',padding:'8px'}}>{month}月 ▾</Text></Picker></View>
    <View style={{display:'flex',flexWrap:'wrap'}}>{['一','二','三','四','五','六','日'].map(d=><Text key={d} style={{width:'14.2857%',textAlign:'center',lineHeight:'36px',color:'#78908a'}}>{d}</Text>)}{cells.map((d,i)=><Text key={i} onClick={()=>d&&setChosen(dayValue(d))} style={{width:'14.2857%',textAlign:'center',lineHeight:'38px',borderRadius:'6px',color:chosen===dayValue(d)?'#fff':'#24463e',background:chosen===dayValue(d)?'#249c93':'transparent'}}>{d||''}</Text>)}</View>
    <View style={{display:'flex',justifyContent:'center',gap:'24px',marginTop:'12px'}}><Text onClick={()=>chosen&&onConfirm(chosen)} style={{padding:'10px 24px',background:chosen?'#249c93':'#b8cbc6',color:'#fff',borderRadius:'6px'}}>确定</Text><Text onClick={onCancel} style={{padding:'10px 24px',color:'#46625a'}}>取消</Text></View>
  </View>;
}
