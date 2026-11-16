import React,{useRef,useState,useEffect} from 'react';
import {View,Text} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {browserRecorder} from '../utils/groupRecorder';
import {inAppServiceGroupAPI as api} from '../services/api';
import {ensureAiDataConsent} from '../utils/aiDataConsent';
export default function GroupVoiceInput({groupId,onSent,onText}){
 const [recording,setRecording]=useState(false),[pending,setPending]=useState(null),[busy,setBusy]=useState(false),[cancelling,setCancelling]=useState(false);
 const ref=useRef({active:true,held:false,cancel:false,starting:false,recorder:null,y:0});
 const finish=audio=>{setRecording(false);if(ref.current.active&&!ref.current.cancel){if(audio.duration<0.6)Taro.showToast({title:'说话时间太短',icon:'none'});else setPending(audio);}};
 useEffect(()=>()=>{const r=ref.current;r.active=false;r.cancel=true;r.held=false;r.recorder?.stop(true);},[]);
 const start=async event=>{
  const r=ref.current;if(busy||pending||recording||r.starting)return;r.starting=true;r.held=true;r.cancel=false;r.y=event?.touches?.[0]?.clientY||event?.clientY||0;setCancelling(false);
  try{
   if(process.env.TARO_ENV==='h5')r.recorder=await browserRecorder(finish);
   else{
    const native=Taro.getRecorderManager();
    const started=()=>{if(!r.held||r.cancel||!r.active)native.stop();};
    const ended=result=>{native.offStart?.(started);native.offStop?.(ended);native.offError?.(failed);if(!r.active||r.cancel){if(r.active)setRecording(false);return;}try{finish({data:'data:audio/mpeg;base64,'+Taro.getFileSystemManager().readFileSync(result.tempFilePath,'base64'),mimeType:'audio/mpeg',duration:result.duration/1000});}catch{setRecording(false);Taro.showToast({title:'录音读取失败',icon:'none'});}};
    const failed=()=>{native.offStart?.(started);native.offStop?.(ended);native.offError?.(failed);if(r.active){setRecording(false);Taro.showToast({title:'请允许麦克风权限后重试',icon:'none'});}};
    native.onStart(started);native.onStop(ended);native.onError(failed);
    r.recorder={stop:(cancel=false)=>{r.cancel=r.cancel||cancel;native.stop();}};
    native.start({duration:60000,format:'mp3',sampleRate:16000,numberOfChannels:1,encodeBitRate:48000});
   }
   if(!r.held||!r.active){r.cancel=true;r.recorder.stop(true);return;}setRecording(true);
  }catch{if(r.active)Taro.showToast({title:'无法录音，请检查麦克风权限',icon:'none'});}
  finally{r.starting=false;}
 };
 const stop=cancel=>{const r=ref.current;r.held=false;r.cancel=r.cancel||cancel;r.recorder?.stop(r.cancel);if(r.cancel)setRecording(false);};
 const submit=async convert=>{if(!pending||busy)return;setBusy(true);try{if(convert){if(!await ensureAiDataConsent('speech'))return;const result=await api.speech(groupId,pending);onText(result.data.text);}else{await api.sendVoice(groupId,pending);onSent?.();}setPending(null);}catch(e){Taro.showToast({title:e.message||'语音处理失败，可重试',icon:'none'});}finally{setBusy(false);}};
 const action={padding:'10px',color:'#187e87'};
 return <View style={{flex:1,minWidth:0}}>{pending?<View style={{background:'#fff',borderRadius:'8px'}}><Text style={{display:'block',padding:'6px'}}>录音 {Math.ceil(pending.duration)} 秒</Text><View style={{display:'flex',flexWrap:'wrap'}}><Text style={action} onClick={()=>submit(false)}>{busy?'处理中…':'发送语音'}</Text><Text style={action} onClick={()=>submit(true)}>转文字</Text><Text style={action} onClick={()=>!busy&&setPending(null)}>取消</Text></View></View>:<View
 onTouchStart={start} onTouchMove={e=>{ref.current.cancel=ref.current.y-(e.touches?.[0]?.clientY||ref.current.y)>60;setCancelling(ref.current.cancel);}}
 onTouchEnd={()=>stop(false)} onTouchCancel={()=>stop(true)}
 {...(process.env.TARO_ENV==='h5'?{onMouseDown:e=>{if(!ref.current.starting&&!ref.current.held)start(e);},onMouseUp:()=>stop(false),onMouseLeave:()=>{if(ref.current.held)stop(true);}}:{})}
 style={{height:'44px',display:'flex',alignItems:'center',justifyContent:'center',background:recording?'#e0f0e8':'#fff',border:'1px solid #d3e2dc',borderRadius:'8px',userSelect:'none'}}><Text>{recording?(cancelling?'松开取消':'松开结束，上滑取消'):'按住说话'}</Text></View>}</View>;
}
