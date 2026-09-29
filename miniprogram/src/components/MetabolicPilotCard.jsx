import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Button, Input, Textarea } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { metabolicPilotAPI } from '../services/api';
const card={padding:'16px',marginBottom:'16px',backgroundColor:'#edf6f1',borderRadius:'14px'};
const para={display:'block',fontSize:'14px',lineHeight:'1.7',marginBottom:'10px',color:'#274838'};
const statuses={invited:'等待你确认',active:'服务中',paused:'已暂停',withdrawn:'已退出',completed:'本期结束'};
export default function MetabolicPilotCard({ refreshKey=0,onStatus,feedback }) {
  const [data,setData]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [goal,setGoal]=useState(''),[help,setHelp]=useState(''),[reflection,setReflection]=useState({});
  const generation=useRef(0);
  const load=async()=>{const current=++generation.current;try{const r=await metabolicPilotAPI.get();if(current!==generation.current)return;setData(r.data);setError('');onStatus?.(!!r.data?.status)}catch(e){if(current===generation.current)setError(e.message)}};
  useEffect(()=>{load();return()=>{generation.current++}},[refreshKey]);
  const act=async(action,body={})=>{if(busy)return;setBusy(true);setError('');try{await metabolicPilotAPI.action({action,...body});await load()}catch(e){setError(e.message)}finally{setBusy(false)}};
  if(!data?.status)return error?<View style={card}><Text style={para}>体重管理反馈暂不可用，健康记录不受影响。</Text><Button onClick={load}>重试反馈</Button></View>:null;
  const active=data.available&&data.status==='active';
  const current=feedback||data.feedback;
  const action=current ? current.action : data.summary?.action;
  return <View style={card}>
    <Text style={{...para,fontSize:'18px',fontWeight:700}}>我的体重与代谢管理</Text>
    <Text style={para}>{statuses[data.status]}{data.startedAt?` · 第${data.summary.week}周 / 共12周`:''}</Text>
    {error&&<Text style={{...para,color:'#b42318'}}>{error}</Text>}
    {!data.available&&<Text style={para}>试点服务暂未开放或资格已暂停，已有健康数据保留。</Text>}
    {data.status==='invited'&&data.available&&<View>
      <Text style={para}>这是一项84天的健康记录与反馈体验。系统帮助你观察变化、选择行动，不要求每日完成任务。本期不收费、不自动续订，可随时退出；暂停不延长周期。</Text>
      <Input maxlength={200} placeholder="你希望了解或改善什么？（选填）" value={goal} onInput={e=>setGoal(e.detail.value)} style={{backgroundColor:'#fff',padding:'10px',marginBottom:'12px'}}/>
      <Button disabled={busy||!data.accepting} onClick={()=>act('start',{consent:true,goal})}>{data.accepting?'了解并开始体验':'暂未开放新入组'}</Button>
    </View>}
    {data.startedAt&&<View>
      <Text style={para}>{data.summary.phase}</Text>
      <Text style={para}>本期已有 {data.summary.recordedDays} 天健康记录{data.summary.latest!=null?` · 起始体重 ${data.summary.baseline} kg · 最近 ${data.summary.latest} kg`:''}</Text>
      {active&&current&&<View style={{backgroundColor:'#fff',padding:'12px',borderRadius:'10px',marginBottom:'12px'}}>
        <Text style={{...para,fontWeight:700}}>{current.title}</Text><Text style={para}>{current.text}</Text>
        <Text style={{...para,fontSize:'11px'}}>系统自动反馈 · 依据当前有效记录更新</Text>
      </View>}
      {active&&action&&<View><Text style={{...para,fontWeight:700}}>你可以尝试：{action.title}</Text><Text style={para}>{action.text}</Text>
        <View style={{display:'flex',gap:'6px'}}>{[['try','愿意尝试'],['later','稍后再说'],['unsuitable','不适合我']].map(([choice,label])=>{const selected=data.actionChoice?.id===action.id&&data.actionChoice.choice===choice;return <Button key={choice} size="mini" disabled={busy} style={{backgroundColor:selected?'#1E6B50':'#fff',color:selected?'#fff':'#274838',border:selected?'1px solid #1E6B50':'1px solid #CDDCD5'}} onClick={()=>act('choose',{id:action.id,choice})}>{selected?'✓ ':''}{label}</Button>})}</View>
        {data.actionChoice?.id===action.id&&<Text style={para}>已保存你的选择，可以随时调整。</Text>}
      </View>}
      {data.reminder&&<Text style={para}>{data.reminder}</Text>}
      {data.available&&['active','paused'].includes(data.status)&&<View style={{marginTop:'12px'}}>
        <Text style={para}>记录提醒（仅在本页展示，不发送微信通知）</Text>
        <View style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>{[1,3,7].map(days=><Button size="mini" key={days} disabled={busy} onClick={()=>act('preferences',{reminderEnabled:true,reminderEveryDays:days})}>{data.reminderEnabled&&data.reminderEveryDays===days?'✓ ':''}每{days}天</Button>)}<Button size="mini" disabled={busy} onClick={()=>act('preferences',{reminderEnabled:false,reminderEveryDays:data.reminderEveryDays})}>关闭提醒</Button></View>
        <Button size="mini" disabled={busy} onClick={()=>act(data.status==='paused'?'resume':'pause')}>{data.status==='paused'?'恢复体验':'暂停体验'}</Button>
      </View>}
      {data.summary.checkpoints.map(point=><View key={point.day} style={{marginTop:'16px',borderTop:'1px solid #cbded2',paddingTop:'10px'}}>
        <Text style={{...para,fontWeight:700}}>第{point.day/7}周回顾</Text><Text style={para}>体重记录覆盖 {point.recordedDays} 天。{point.first&&point.last?`${point.first.date}：${point.first.value} kg → ${point.last.date}：${point.last.value} kg。`:''}{point.note}</Text>
        {point.reflection&&<Text style={para}>你的感受：{point.reflection}</Text>}
        {data.available&&['active','completed'].includes(data.status)&&<View><Textarea maxlength={1000} placeholder="哪些行动有帮助？遇到了什么困难？" value={reflection[point.day]||''} onInput={e=>setReflection({...reflection,[point.day]:e.detail.value})} style={{backgroundColor:'#fff',width:'100%',height:'70px'}}/><Button size="mini" disabled={busy||!reflection[point.day]?.trim()} onClick={()=>act('reflect',{day:point.day,text:reflection[point.day]})}>保存阶段感受</Button></View>}
      </View>)}
      {data.status==='completed'&&<Text style={para}>本期已结束，记录和回顾仍可查看。若希望继续维持，可向健管专员表达需求，本服务不会自动收费或续订。</Text>}
      {data.help?.status&&<Text style={para}>{data.help.status==='open'?'求助已提交，等待所属团队处理。':`团队回复：${data.help.reply}`}</Text>}
      {data.available&&['active','paused','completed'].includes(data.status)&&data.help?.status!=='open'&&<View style={{marginTop:'16px'}}>
        <Textarea maxlength={1000} value={help} onInput={e=>setHelp(e.detail.value)} placeholder="希望团队帮你解决什么？" style={{backgroundColor:'#fff',width:'100%',height:'70px'}}/>
        <Button size="mini" disabled={busy||!help.trim()} onClick={()=>act('help',{message:help})}>需要帮助</Button><Text style={{...para,fontSize:'12px'}}>此处不是急救通道；明显不适请及时就医，不要等待线上回复。</Text>
      </View>}
    </View>}
    {!['withdrawn','completed'].includes(data.status)&&<Button size="mini" disabled={busy} onClick={async()=>{const r=await Taro.showModal({title:'退出本期体验',content:'退出后保留健康记录，本期不再提供自动反馈。确定退出吗？'});if(r.confirm)act('withdraw')}}>退出本期体验</Button>}
  </View>;
}
