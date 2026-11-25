import ChatVoicePlayer from './ChatVoicePlayer';
import React,{useState} from 'react';
import {inAppServiceGroupAPI as api} from '../api';
export default function GroupVoiceMessage({message,groupId}){
 const [text,setText]=useState(message.audioTranscript||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const convert=async()=>{if(busy)return;setBusy(true);setError('');try{const r=await api.transcribe(groupId,message.id);setText(r.data.text);}catch(e){setError(e.message||'转文字失败');}finally{setBusy(false);}};
 return <div><ChatVoicePlayer src={message.audioUrl} duration={message.audioDuration}/>{text?<p style={{whiteSpace:'pre-wrap'}}>{text}</p>:<button disabled={busy} onClick={convert}>{busy?'正在转文字…':'转文字'}</button>}{error&&<p role="alert">{error}</p>}</div>;
}
