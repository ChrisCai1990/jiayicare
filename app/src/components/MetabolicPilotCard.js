import React, { useEffect, useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { metabolicPilotAPI } from '../services/api';
const paragraph={fontSize:14,lineHeight:23,color:'#274838',marginBottom:10};
const states={invited:'等待你确认',active:'服务中',paused:'已暂停',withdrawn:'已退出',completed:'本期结束'};
export default function MetabolicPilotCard({ refreshKey=0,onStatus,feedback }) {
  const [data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [goal,setGoal]=useState(''),[help,setHelp]=useState(''),[reflection,setReflection]=useState({}),[confirmExit,setConfirmExit]=useState(false);
  const generation=useRef(0);
  const load=async()=>{const current=++generation.current;try{const r=await metabolicPilotAPI.get();if(current!==generation.current)return;setData(r.data);setError('');onStatus?.(!!r.data?.status)}catch(e){if(current===generation.current)setError(e.message)}};
  useEffect(()=>{load();return()=>{generation.current++}},[refreshKey]);
  const act=async(action,body={})=>{if(busy)return;setBusy(true);setError('');try{await metabolicPilotAPI.action({action,...body});await load()}catch(e){setError(e.message)}finally{setBusy(false)}};
  const button=(label,onPress,disabled=false)=><TouchableOpacity accessibilityRole="button" disabled={busy||disabled} onPress={onPress} style={{padding:10,marginVertical:4,backgroundColor:'#fff',borderRadius:8,opacity:busy||disabled?0.5:1}}><Text style={{color:'#1e6b50'}}>{label}</Text></TouchableOpacity>;
  if(!data?.status)return error?<View style={{padding:16}}><Text style={paragraph}>体重管理反馈暂不可用，健康记录不受影响。</Text>{button('重试反馈',load)}</View>:null;
  const active=data.available&&data.status==='active', current=feedback||data.feedback;
  const action=current ? current.action : data.summary?.action;
  return <View style={{padding:16,marginBottom:16,backgroundColor:'#edf6f1',borderRadius:14}}>
    <Text style={{...paragraph,fontSize:18,fontWeight:'700'}}>我的体重与代谢管理</Text>
    <Text style={paragraph}>{states[data.status]}{data.startedAt?` · 第${data.summary.week}周 / 共12周`:''}</Text>
    {!!error&&<Text style={{...paragraph,color:'#b42318'}}>{error}</Text>}
    {!data.available&&<Text style={paragraph}>试点服务暂未开放或资格已暂停，已有健康数据保留。</Text>}
    {data.status==='invited'&&data.available&&<View>
      <Text style={paragraph}>84天健康记录与反馈体验，帮助你观察变化、选择行动，无需每日完成任务。本期不收费、不自动续订，可随时退出；暂停不延长周期。</Text>
      <TextInput maxLength={200} placeholder="你希望了解或改善什么？（选填）" value={goal} onChangeText={setGoal} style={{padding:10,backgroundColor:'#fff'}}/>
      {button(data.accepting?'了解并开始体验':'暂未开放新入组',()=>act('start',{consent:true,goal}),!data.accepting)}
    </View>}
    {data.startedAt&&<View>
      <Text style={paragraph}>{data.summary.phase}</Text>
      <Text style={paragraph}>本期已有 {data.summary.recordedDays} 天健康记录{data.summary.latest!=null?` · 起始 ${data.summary.baseline} kg · 最近 ${data.summary.latest} kg`:''}</Text>
      {active&&current&&<View style={{backgroundColor:'#fff',padding:12,borderRadius:10}}><Text style={{...paragraph,fontWeight:'700'}}>{current.title}</Text><Text style={paragraph}>{current.text}</Text><Text style={paragraph}>系统自动反馈 · 依据当前有效记录更新</Text></View>}
      {active&&action&&<View><Text style={{...paragraph,fontWeight:'700'}}>你可以尝试：{action.title}</Text><Text style={paragraph}>{action.text}</Text>
        {button('愿意尝试',()=>act('choose',{id:action.id,choice:'try'}))}{button('稍后再说',()=>act('choose',{id:action.id,choice:'later'}))}{button('不适合我',()=>act('choose',{id:action.id,choice:'unsuitable'}))}
        {data.actionChoice?.id===action.id&&<Text style={paragraph}>已保存你的选择，可以随时调整。</Text>}
      </View>}
      {!!data.reminder&&<Text style={paragraph}>{data.reminder}</Text>}
      {data.available&&['active','paused'].includes(data.status)&&<View><Text style={paragraph}>记录提醒仅在本页展示，不发送微信通知</Text>
        {[1,3,7].map(days=><View key={days}>{button(`${data.reminderEnabled&&data.reminderEveryDays===days?'✓ ':''}每${days}天提醒`,()=>act('preferences',{reminderEnabled:true,reminderEveryDays:days}))}</View>)}
        {button('关闭提醒',()=>act('preferences',{reminderEnabled:false,reminderEveryDays:data.reminderEveryDays}))}
        {button(data.status==='paused'?'恢复体验':'暂停体验',()=>act(data.status==='paused'?'resume':'pause'))}
      </View>}
      {data.summary.checkpoints.map(point=><View key={point.day} style={{marginTop:16}}><Text style={{...paragraph,fontWeight:'700'}}>第{point.day/7}周回顾</Text>
        <Text style={paragraph}>体重记录覆盖 {point.recordedDays} 天。{point.first&&point.last?`${point.first.date}：${point.first.value} kg → ${point.last.date}：${point.last.value} kg。`:''}{point.note}</Text>
        {!!point.reflection&&<Text style={paragraph}>你的感受：{point.reflection}</Text>}
        {data.available&&['active','completed'].includes(data.status)&&<View><TextInput multiline maxLength={1000} placeholder="哪些行动有帮助？遇到了什么困难？" value={reflection[point.day]||''} onChangeText={v=>setReflection({...reflection,[point.day]:v})} style={{backgroundColor:'#fff',padding:10,minHeight:65}}/>{button('保存阶段感受',()=>act('reflect',{day:point.day,text:reflection[point.day]}),!reflection[point.day]?.trim())}</View>}
      </View>)}
      {data.status==='completed'&&<Text style={paragraph}>本期已结束。若希望继续维持，可向健管专员表达需求，本服务不会自动收费或续订。</Text>}
      {!!data.help?.status&&<Text style={paragraph}>{data.help.status==='open'?'求助已提交，等待所属团队处理。':`团队回复：${data.help.reply}`}</Text>}
      {data.available&&['active','paused','completed'].includes(data.status)&&data.help?.status!=='open'&&<View>
        <TextInput multiline maxLength={1000} placeholder="希望团队帮你解决什么？" value={help} onChangeText={setHelp} style={{backgroundColor:'#fff',padding:10,minHeight:65}}/>
        {button('需要帮助',()=>act('help',{message:help}),!help.trim())}<Text style={paragraph}>此处不是急救通道；明显不适请及时就医，不要等待线上回复。</Text>
      </View>}
    </View>}
    {!['withdrawn','completed'].includes(data.status)&&(confirmExit?<View><Text style={paragraph}>确定退出本期体验？健康记录会保留。</Text>{button('确认退出',()=>act('withdraw'))}{button('继续体验',()=>setConfirmExit(false))}</View>:button('退出本期体验',()=>setConfirmExit(true)))}
  </View>;
}
