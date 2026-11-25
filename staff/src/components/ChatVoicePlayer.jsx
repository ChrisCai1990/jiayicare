import React, {useRef,useState} from 'react';
import {AudioLines} from 'lucide-react';
export default function ChatVoicePlayer({src,duration=0}) {
  const audio=useRef(null);
  const [playing,setPlaying]=useState(false),[heard,setHeard]=useState(false),[error,setError]=useState('');
  const toggle=async()=>{
    if(playing){audio.current?.pause();return;}
    try {setError('');await audio.current.play();setHeard(true);}
    catch {setError('语音暂时无法播放，请刷新后重试');}
  };
  return <div className="chat-voice-player"><audio ref={audio} preload="none" src={src} onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={()=>setPlaying(false)} onError={()=>{setPlaying(false);setError('语音暂时无法播放，请刷新后重试');}}/><button type="button" aria-label={playing?'暂停语音':'播放语音'} onClick={toggle}><AudioLines size={22}/><span>{playing?'播放中':`语音 ${Math.round(duration)}″`}{!heard&&!playing?' · 未听':''}</span></button>{error&&<small role="alert">{error}</small>}</div>;
}
