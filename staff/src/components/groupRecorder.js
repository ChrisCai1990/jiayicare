// H5 records PCM and encodes 16kHz mono WAV, matching the existing ASR service.
export function nativeRecorderAvailable() {
 return !!(window.StaffNativeAudio && window.__JIAYI_NATIVE_AUDIO_KEY);
}

export function nativeRecorder(onComplete) {
 const key=window.__JIAYI_NATIVE_AUDIO_KEY;
 const status=window.StaffNativeAudio.start(key);
 if(status!=='ok') throw new Error(status==='permission_denied'?'请在手机设置中允许嘉医汇医护使用麦克风':'手机录音启动失败，请重试');
 let stopped=false;
 const timer=setTimeout(()=>stop(false),60000);
 const stop=async(cancel=false)=>{
  if(stopped)return;
  stopped=true;clearTimeout(timer);
  const result=JSON.parse(window.StaffNativeAudio.stop(key,!!cancel));
  if(result.error) throw new Error('手机录音结束失败，请重试');
  if(!cancel&&result.data) onComplete(result);
 };
 return {stop};
}

export async function browserRecorder(onComplete) {
 if(nativeRecorderAvailable()) return nativeRecorder(onComplete);
 const stream=await navigator.mediaDevices.getUserMedia({audio:true});
 let ctx,node,source,stopped=false,timer;
 try {
  const AudioContext=window.AudioContext||window.webkitAudioContext;ctx=new AudioContext();await ctx.resume();
  source=ctx.createMediaStreamSource(stream);node=ctx.createScriptProcessor(4096,1,1);const chunks=[];let samples=0;
  node.onaudioprocess=e=>{if(samples>=ctx.sampleRate*60)return;const part=new Float32Array(e.inputBuffer.getChannelData(0));chunks.push(part);samples+=part.length;};
  source.connect(node);node.connect(ctx.destination);
  const stop=async(cancel=false)=>{
   if(stopped)return;stopped=true;clearTimeout(timer);node.disconnect();source.disconnect();stream.getTracks().forEach(t=>t.stop());
   const rate=ctx.sampleRate;await ctx.close();if(cancel)return;
   const all=new Float32Array(samples);let offset=0;chunks.forEach(c=>{all.set(c,offset);offset+=c.length;});
   const length=Math.min(960000,Math.floor(samples*16000/rate));const bytes=new ArrayBuffer(44+length*2),view=new DataView(bytes);
   const str=(at,s)=>{for(let i=0;i<s.length;i++)view.setUint8(at+i,s.charCodeAt(i));};
   str(0,'RIFF');view.setUint32(4,36+length*2,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,length*2,true);
   for(let i=0;i<length;i++){const from=Math.floor(i*rate/16000),to=Math.max(from+1,Math.floor((i+1)*rate/16000));let sum=0;for(let j=from;j<to&&j<all.length;j++)sum+=all[j];const value=Math.max(-1,Math.min(1,sum/(to-from)));view.setInt16(44+i*2,value<0?value*32768:value*32767,true);}
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(new Blob([bytes],{type:'audio/wav'}));});
   onComplete({data,mimeType:'audio/wav',duration:length/16000});
  };
  timer=setTimeout(()=>stop(),60000);return {stop};
 }catch(e){stream.getTracks().forEach(t=>t.stop());node?.disconnect();source?.disconnect();await ctx?.close();throw e;}
}
