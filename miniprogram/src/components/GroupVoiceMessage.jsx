import Icon from './Icon';
import React,{useState,useRef,useEffect} from 'react';
import {View,Text} from '@tarojs/components';
import Taro from '@tarojs/taro';
import {inAppServiceGroupAPI as api} from '../services/api';
import {ensureAiDataConsent} from '../utils/aiDataConsent';
export default function GroupVoiceMessage({message,groupId,color='#1A2B24'}){
 const player=useRef(null),[playing,setPlaying]=useState(false),[busy,setBusy]=useState(false),[text,setText]=useState(message.audioTranscript||'');
 useEffect(()=>()=>{player.current?.stop?.();player.current?.pause?.();player.current?.destroy?.();},[]);
 const play=()=>{if(playing){player.current?.stop?.();player.current?.pause?.();setPlaying(false);return;}try{if(!player.current){const p=process.env.TARO_ENV==='h5'?new Audio():Taro.createInnerAudioContext();player.current=p;const end=()=>setPlaying(false),error=()=>{end();Taro.showToast({title:'语音播放失败，请重试',icon:'none'});};if(process.env.TARO_ENV==='h5'){p.onended=end;p.onerror=error;}else{p.onEnded(end);p.onError(error);}}player.current.src=message.audioUrl;const promise=player.current.play();promise?.catch?.(()=>{setPlaying(false);Taro.showToast({title:'无法播放语音',icon:'none'});});setPlaying(true);}catch{Taro.showToast({title:'无法播放语音',icon:'none'});}};
 const convert=async()=>{if(busy)return;setBusy(true);try{if(!await ensureAiDataConsent('speech'))return;const result=await api.transcribe(groupId,message.id);setText(result.data.text);}catch(e){Taro.showToast({title:e.message||'转文字失败',icon:'none'});}finally{setBusy(false);}};
 return <View><View onClick={play} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px',color}}><Icon name='audio-lines' size={22} color={color}/><Text>{playing?'播放中，点击停止':'语音'} {Math.round(message.audioDuration||1)}″</Text></View>{text?<Text style={{display:'block',whiteSpace:'pre-wrap'}}>{text}</Text>:<Text onClick={convert} style={{display:'block',padding:'6px',color:'#187e87'}}>{busy?'正在转文字…':'转文字'}</Text>}</View>;
}
