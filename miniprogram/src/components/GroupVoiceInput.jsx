import React,{useRef,useState,useEffect} from 'react';
import {View,Text} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {browserRecorder} from '../utils/groupRecorder';
import {inAppServiceGroupAPI as api} from '../services/api';
export default function GroupVoiceInput({groupId,onSent,quotedMessageId=null}){
 const [recording,setRecording]=useState(false),[pending,setPending]=useState(null),[busy,setBusy]=useState(false),[cancelling,setCancelling]=useState(false);
 const [preparing,setPreparing]=useState(false),[seconds,setSeconds]=useState(0);
 useEffect(()=>{if(!recording)return;const at=Date.now();setSeconds(0);const timer=setInterval(()=>setSeconds(Math.min(60,Math.floor((Date.now()-at)/1000))),250);return()=>clearInterval(timer);},[recording]);
 const ready=()=>{if(!ref.current.active||!ref.current.held)return;setPreparing(false);setRecording(true);try{if(process.env.TARO_ENV!=='h5')Taro.vibrateShort({type:'light'}).catch(()=>{});else if(navigator.vibrate)navigator.vibrate(20);}catch{}};
 const ref=useRef({active:true,held:false,cancel:false,starting:false,recorder:null,y:0});
 const finish=audio=>{setRecording(false);setPreparing(false);if(ref.current.active&&!ref.current.cancel){if(audio.duration<0.6)Taro.showToast({title:'说话时间太短',icon:'none'});else void submit(audio);}};
 useEffect(()=>()=>{const r=ref.current;r.active=false;r.cancel=true;r.held=false;r.recorder?.stop(true);},[]);
 const start=async event=>{
  const r=ref.current;if(busy||pending||recording||preparing||r.held||r.starting||r.sending)return;r.starting=true;r.held=true;r.cancel=false;r.y=event?.touches?.[0]?.clientY||event?.clientY||0;setCancelling(false);setPreparing(true);
  try{
   if(process.env.TARO_ENV==='h5')r.recorder=await browserRecorder(finish);
   else{
    const native=Taro.getRecorderManager();
    const started=()=>{if(!r.held||r.cancel||!r.active)native.stop();else ready();};
    const ended=result=>{native.offStart?.(started);native.offStop?.(ended);native.offError?.(failed);if(!r.active||r.cancel){if(r.active)setRecording(false);return;}try{finish({data:'data:audio/mpeg;base64,'+Taro.getFileSystemManager().readFileSync(result.tempFilePath,'base64'),mimeType:'audio/mpeg',duration:result.duration/1000});}catch{setRecording(false);Taro.showToast({title:'录音读取失败',icon:'none'});}};
    const failed=()=>{native.offStart?.(started);native.offStop?.(ended);native.offError?.(failed);if(r.active){setPreparing(false);setRecording(false);Taro.showToast({title:'请允许麦克风权限后重试',icon:'none'});}};
    native.onStart(started);native.onStop(ended);native.onError(failed);
    r.recorder={stop:(cancel=false)=>{r.cancel=r.cancel||cancel;native.stop();}};
    native.start({duration:60000,format:'mp3',sampleRate:16000,numberOfChannels:1,encodeBitRate:48000});
   }
   if(!r.held||!r.active){r.cancel=true;r.recorder.stop(true);return;}if(process.env.TARO_ENV==='h5')ready();
  }catch{setPreparing(false);if(r.active)Taro.showToast({title:'无法录音，请检查麦克风权限',icon:'none'});}
  finally{r.starting=false;}
 };
 const stop=cancel=>{const r=ref.current;r.held=false;setPreparing(false);r.cancel=r.cancel||cancel;r.recorder?.stop(r.cancel);if(r.cancel)setRecording(false);};
 const submit=async audio=>{if(!audio||ref.current.sending)return;ref.current.sending=true;setBusy(true);setPending(null);try{await api.sendVoice(groupId,audio,quotedMessageId);if(ref.current.active)onSent?.();}catch(e){if(ref.current.active){setPending(audio);Taro.showToast({title:e.message||'语音发送失败，可重试',icon:'none'});}}finally{ref.current.sending=false;if(ref.current.active)setBusy(false);}};
 const action={padding:'10px',color:'#187e87'};
 return <View style={{flex:1,minWidth:0,position:'relative'}}>{recording&&<View style={{position:'absolute',bottom:'56px',left:'50%',transform:'translateX(-50%)',zIndex:30,pointerEvents:'none',minWidth:'160px',padding:'14px',borderRadius:'12px',background:cancelling?'#b42318':'#243e36',color:'#fff',textAlign:'center',boxShadow:'0 4px 16px #0003'}}><Text style={{display:'block',fontSize:'20px',fontWeight:'bold'}}><Text style={{color:'#ff7878'}}>●</Text> {seconds} 秒</Text><Text style={{fontSize:'13px'}}>{cancelling?'松开取消发送':'正在录音 · 上滑取消'}</Text></View>}{pending?<View style={{background:'#fff',borderRadius:'8px'}}><Text style={{display:'block',padding:'6px'}}>发送失败 · {Math.ceil(pending.duration)} 秒</Text><View style={{display:'flex',flexWrap:'wrap'}}><Text style={action} onClick={()=>submit(pending)}>重试发送</Text><Text style={action} onClick={()=>!busy&&setPending(null)}>取消</Text></View></View>:<View
 onTouchStart={start} onTouchMove={e=>{ref.current.cancel=ref.current.y-(e.touches?.[0]?.clientY||ref.current.y)>60;setCancelling(ref.current.cancel);}}
 onTouchEnd={()=>stop(false)} onTouchCancel={()=>stop(true)}
 {...(process.env.TARO_ENV==='h5'?{onMouseDown:e=>{if(!ref.current.starting&&!ref.current.held)start(e);},onMouseUp:()=>stop(false),onMouseLeave:()=>{if(ref.current.held)stop(true);}}:{})}
 style={{height:'44px',display:'flex',alignItems:'center',justifyContent:'center',transform:recording||preparing?'scale(0.98)':'none',boxShadow:recording?'inset 0 2px 5px #0002':'none',color:recording?'#fff':'#24483d',background:recording?(cancelling?'#b42318':'#20745d'):preparing?'#e0f0e8':'#fff',touchAction:'none',border:'1px solid #d3e2dc',borderRadius:'8px',userSelect:'none'}}><Text>{busy?'发送中…':preparing?'正在开启麦克风…':recording?(cancelling?'松开取消':'松开发送，上滑取消'):'按住说话'}</Text></View>}</View>;
}
