import React,{useEffect,useRef,useState} from 'react';
import {browserRecorder} from './groupRecorder';
import {inAppServiceGroupAPI as api} from '../api';
export default function GroupVoiceInput({groupId,quotedMessageId,onSent,onText}){
 const [recording,setRecording]=useState(false),[audio,setAudio]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const state=useRef({active:true,held:false,starting:false,cancel:false,y:0});
 useEffect(()=>()=>{state.current.active=false;state.current.held=false;state.current.recorder?.stop(true);},[]);
 const start=async e=>{
  const s=state.current;if(s.starting||recording||busy||audio)return;
  s.held=true;s.starting=true;s.cancel=false;s.y=e.clientY;setError('');e.currentTarget.setPointerCapture?.(e.pointerId);
  try{s.recorder=await browserRecorder(value=>{if(!s.active)return;setRecording(false);if(!s.cancel){if(value.duration<0.6)setError('说话时间太短');else setAudio(value);}});if(!s.active||!s.held)s.recorder.stop(true);else setRecording(true);}
  catch{if(s.active)setError('无法录音，请允许麦克风权限后重试');}finally{s.starting=false;}
 };
 const stop=cancel=>{const s=state.current;s.held=false;s.cancel=s.cancel||cancel;s.recorder?.stop(s.cancel);if(s.cancel)setRecording(false);};
 const submit=async convert=>{if(busy||!audio)return;setBusy(true);setError('');try{if(convert){const result=await api.speech(groupId,audio);onText(result.data.text);}else{await api.sendVoice(groupId,audio,quotedMessageId);onSent?.();}setAudio(null);}catch(e){setError(e.message||'语音处理失败，可重试');}finally{setBusy(false);}};
 return <div>{audio?<div>录音 {Math.ceil(audio.duration)} 秒 <button disabled={busy} onClick={()=>submit(false)}>发送语音</button><button disabled={busy} onClick={()=>submit(true)}>转文字</button><button disabled={busy} onClick={()=>setAudio(null)}>取消</button></div>:<button type="button" style={{width:'100%',minHeight:60,touchAction:'none',userSelect:'none'}} onPointerDown={start} onPointerMove={e=>{if(state.current.held)state.current.cancel=state.current.y-e.clientY>60;}} onPointerUp={()=>stop(false)} onPointerCancel={()=>stop(true)}>{recording?'松开结束，上滑取消':'按住说话'}</button>}{error&&<p role="alert">{error}</p>}</div>;
}
