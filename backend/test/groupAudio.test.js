const test=require('node:test'),assert=require('node:assert/strict');
const {validate}=require('../src/utils/groupAudio');
test('group audio validates supported original bytes, duration and size before storage',()=>{
 const buffer=Buffer.alloc(48);buffer.write('RIFF');buffer.write('WAVE',8);const wav={data:'data:audio/wav;base64,'+buffer.toString('base64'),mimeType:'audio/wav',duration:2};
 assert.equal(validate(wav).duration,2);assert.throws(()=>validate({...wav,duration:62}));assert.throws(()=>validate({...wav,duration:NaN}));assert.throws(()=>validate({...wav,data:'https://example.com/file'}));assert.throws(()=>validate({...wav,mimeType:'audio/mpeg'}));assert.throws(()=>validate({...wav,data:'data:audio/wav;base64,'+Buffer.from('not audio').toString('base64')}));
 const mp3={data:'data:audio/mpeg;base64,'+Buffer.from('ID3 synthetic').toString('base64'),mimeType:'audio/mpeg',duration:1};assert.equal(validate(mp3).mimeType,'audio/mpeg');
});
