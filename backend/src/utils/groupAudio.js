const fail=message=>{throw Object.assign(new Error(message),{status:400})};
function validate(audio){
 if(!audio||!['audio/mpeg','audio/wav'].includes(audio.mimeType))fail('语音格式不支持');
 if(typeof audio.data!=='string'||audio.data.length>12*1024*1024||!/^data:audio\/(mpeg|wav);base64,[A-Za-z0-9+/]+={0,2}$/.test(audio.data))fail('语音文件无效或过大');
 const buffer=Buffer.from(audio.data.split(',')[1],'base64');
 const wav=buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WAVE';
 const mp3=buffer.toString('ascii',0,3)==='ID3'||(buffer[0]===255&&(buffer[1]&224)===224);
 if(!buffer.length||(audio.mimeType==='audio/wav'?!wav:!mp3))fail('语音文件格式无效');
 const duration=Number(audio.duration);if(!Number.isFinite(duration)||duration<0.6||duration>61)fail('语音时长须在1至60秒内');
 return {buffer,mimeType:audio.mimeType,duration:Math.ceil(duration)};
}
async function transcribe(userId,data,mimeType){
 const consent=require('./aiDataConsent'),asr=require('./asr');
 await consent.assertPermission(userId,'speech','aliyun-nls');
 if(process.env.REVIEW_ENVIRONMENT==='isolated'||!asr.asrEnabled())throw Object.assign(new Error('语音转文字暂不可用，可保留原语音'),{status:503});
 const text=String(await consent.withPersonalData(userId,'speech',()=>asr.transcribeBase64(data,mimeType))||'').trim();
 if(!text)throw Object.assign(new Error('没有识别到文字，请重试或发送原语音'),{status:422});
 await consent.assertPermission(userId,'speech','aliyun-nls');return text.slice(0,2000);
}
module.exports={validate,transcribe};
