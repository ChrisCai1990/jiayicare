import GroupVoiceMessage from './GroupVoiceMessage';
import { openChatFile } from '../utils/openChatFile';
import ChatDateCalendar from './ChatDateCalendar';
import React,{useEffect,useRef,useState} from 'react';
import {View,Text,Input,Picker,ScrollView,Image} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {inAppServiceGroupAPI as api,reportsAPI} from '../services/api';
const List=process.env.TARO_ENV==='h5'?View:ScrollView;
const button={padding:'10px',color:'#187e87',fontSize:'14px'};
export default function GroupHistory({group,onClose,topInset=0,initialMessageId=null}) {
 const [calendarOpen,setCalendarOpen]=useState(false);
 const [q,setQ]=useState(''),[date,setDate]=useState(''),[kind,setKind]=useState('all');
 const [rows,setRows]=useState([]),[context,setContext]=useState(null),[next,setNext]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef(0),applied=useRef({});
 const search=async(more=false,override={})=>{
  const serial=++request.current,query=more?applied.current:{q,date,kind,...override};
  setCalendarOpen(false);
  if(!more){applied.current=query;setRows([]);setNext('');}setBusy(true);setError('');setContext(null);
  try{const result=await api.history(group.id,{...query,...(more?{before:next}:{})});if(serial!==request.current)return;
   setRows(old=>more?[...old,...result.data]:result.data);setNext(result.hasMore?result.nextBefore:'');
  }catch(e){if(serial===request.current)setError(e.message||'查询失败，请重试');}
  finally{if(serial===request.current)setBusy(false);}
 };
 const open=async(id)=>{const serial=++request.current;setBusy(true);setError('');try{const result=await api.historyContext(group.id,id);if(serial===request.current)setContext(result);}catch(e){if(serial===request.current)setError(e.message||'读取失败');}finally{if(serial===request.current)setBusy(false);}};
 useEffect(()=>{if(calendarOpen&&process.env.TARO_ENV==='h5'){const pane=document.getElementById('group-history-results');if(pane)pane.scrollTop=0;}},[calendarOpen]);
 useEffect(()=>{if(initialMessageId)open(initialMessageId);else search();return()=>{request.current++;};},[group.id]);
 useEffect(()=>{if(process.env.TARO_ENV==='h5'&&context){setTimeout(()=>{const pane=document.getElementById('group-history-results'),target=document.getElementById('history-'+context.anchorId);if(pane&&target)pane.scrollTop+=target.getBoundingClientRect().top-pane.getBoundingClientRect().top-20;},100);}},[context]);
 return <View style={{position:'absolute',inset:0,zIndex:100,paddingTop:topInset+'px',boxSizing:'border-box',background:'#f7faf9',display:'flex',flexDirection:'column',overflow:'hidden'}}>
  <View style={{padding:'14px 12px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,background:'#fff'}}><Text style={{fontWeight:700}}>查找聊天记录</Text><Text onClick={onClose} style={button}>关闭</Text></View>
  <View style={{padding:'12px',background:'#fff',flexShrink:0}}>
   <View style={{display:'flex',alignItems:'center',gap:'8px',flexShrink:0}}>
    <View style={{flex:1,minWidth:0,height:'48px',padding:'0 10px',border:'1px solid #d3e2dc',borderRadius:'8px',background:'#fff',display:'flex',alignItems:'center',boxSizing:'border-box'}}>
     <Input id="group-history-keyword" value={q} maxlength={80} placeholder="输入聊天关键词" confirmType="search" onInput={e=>setQ(e.detail.value)} onConfirm={()=>search()} style={{display:'block',width:'100%',height:'28px',minHeight:'28px',padding:0,margin:0,border:0,fontSize:'16px',lineHeight:'28px',color:'#25473f',boxSizing:'content-box'}}/>
    </View>
    <Text onClick={()=>!busy&&search()} style={{...button,flexShrink:0}}>查找</Text>
   </View>
   <View style={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:'8px',marginTop:'10px'}}>
    {[['all','全部'],['image','图片'],['file','PDF']].map(([value,label])=><Text key={value} onClick={()=>{setKind(value);setDate('');search(false,{kind:value,date:''});}} style={{...button,background:!calendarOpen&&!date&&kind===value?'#def1e9':'#fff',borderRadius:'6px'}}>{label}</Text>)}
    <Text onClick={()=>setCalendarOpen(!calendarOpen)} style={{...button,background:calendarOpen||date?'#def1e9':'#fff',borderRadius:'6px'}}>{date||'日期'}</Text>
    {!!date&&<Text onClick={()=>{setDate('');search(false,{date:''});}} style={button}>清除日期</Text>}
   </View>
  </View>
  {!!error&&<Text style={{padding:'10px',color:'#b42318'}}>{error}</Text>}
  {!calendarOpen&&context&&<Text onClick={()=>setContext(null)} style={button}>‹ 返回搜索结果 · 原消息前后各最多20条</Text>}
  <List id="group-history-results" scrollY scrollIntoView={context?'history-'+context.anchorId:''} style={{flex:1,height:0,minHeight:0,overflowY:'auto',WebkitOverflowScrolling:'touch',padding:'12px',boxSizing:'border-box'}}>
   {calendarOpen&&<ChatDateCalendar value={date} onCancel={()=>setCalendarOpen(false)} onConfirm={value=>{setDate(value);setKind('all');search(false,{date:value,kind:'all'});}}/>}
   {!calendarOpen&&<View>
   {busy&&<Text>正在读取…</Text>}
   {!busy&&!(context?.data||rows).length&&<Text>未找到聊天记录，请调整日期或关键词。</Text>}
   {(context?.data||rows).map(m=><View id={'history-'+m.id} key={m.id} style={{padding:'12px',marginBottom:'10px',background:'#fff',borderRadius:'10px',border:String(m.id)===String(context?.anchorId)?'2px solid #249c93':'1px solid #e0e9e5'}}>
    <Text style={{display:'block',fontSize:'12px',color:'#6a817a'}}>{m.senderName} · {new Date(m.createdAt).toLocaleString('zh-CN')}</Text>
    {m.fileUrl&&<Text onClick={()=>openChatFile(m,group.id)} style={{display:'block',color:'#187e87',fontWeight:'700'}}>{m.fileMimeType?.startsWith('image/')?'🖼 查看图片':`📎 ${m.fileName||'查看文件'}`}</Text>}
    <Text style={{display:'block',whiteSpace:'pre-wrap',wordBreak:'break-all',marginTop:'8px'}}>{m.audioUrl || (m.fileUrl&&['[文件]','[图片]'].includes(m.content))?'':m.content}</Text>
    {m.audioUrl&&<GroupVoiceMessage message={m} groupId={group.id}/>}
    {m.material&&(m.material.files||[]).map((url,i)=>m.material.mimeType==='application/pdf'?<Text key={i} style={{...button,display:'block'}} onClick={async()=>{Taro.showLoading({title:'正在打开文件...'});try{if(process.env.TARO_ENV==='h5')window.location.assign(url);else{const filePath=await reportsAPI.downloadOriginal(m.material.id,i,'application/pdf');await Taro.openDocument({filePath,fileType:'pdf',showMenu:true});}}catch(error){Taro.showModal({title:'原件打开失败',content:error?.message||'请稍后重试',showCancel:false});}finally{Taro.hideLoading();}}}>查看PDF原件</Text>:<Image key={i} src={url} mode="aspectFit" style={{width:'100px',height:'100px'}} onClick={()=>Taro.previewImage({current:url,urls:m.material.files})}/>)}
    {!context&&<Text onClick={()=>!busy&&open(m.id)} style={{...button,display:'block'}}>查看前后对话</Text>}
   </View>)}
   {!context&&next&&<Text onClick={()=>!busy&&search(true)} style={{...button,display:'block',textAlign:'center'}}>加载更多结果</Text>}
   </View>}
  </List>
 </View>;
}
