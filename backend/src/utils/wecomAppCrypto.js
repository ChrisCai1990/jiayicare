const {createHash,createCipheriv,createDecipheriv,randomBytes,timingSafeEqual} = require('crypto');
function signature(token,timestamp,nonce,encrypted) {
  return createHash('sha1').update([token,timestamp,nonce,encrypted].map(String).sort().join('')).digest('hex');
}
function verify(q, encrypted, token, now = Date.now()) {
  if (!token || !/^\d{10}$/.test(q.timestamp || '') || Math.abs(now/1000-Number(q.timestamp))>300 || !/^[\w-]{1,128}$/.test(q.nonce || '') || !/^[a-f0-9]{40}$/.test(q.msg_signature || '')) throw new Error('Invalid signature');
  const expected=signature(token,q.timestamp,q.nonce,encrypted);
  if(!timingSafeEqual(Buffer.from(expected),Buffer.from(q.msg_signature))) throw new Error('Invalid signature');
}
function aesKey(value) {
  if(!/^[A-Za-z0-9+/]{43}$/.test(value || '')) throw new Error('Invalid AES key');
  return Buffer.from(value+'=','base64');
}
function decrypt(encrypted,keyValue,corpId) {
  if(!corpId || !/^[A-Za-z0-9+/]+={0,2}$/.test(encrypted || '') || encrypted.length>100000) throw new Error('Invalid message');
  const key=aesKey(keyValue), d=createDecipheriv('aes-256-cbc',key,key.subarray(0,16)); d.setAutoPadding(false);
  let raw=Buffer.concat([d.update(Buffer.from(encrypted,'base64')),d.final()]);
  const padding=raw[raw.length-1];
  if(padding<1 || padding>32 || !raw.subarray(-padding).every(v=>v===padding)) throw new Error('Invalid padding');
  raw=raw.subarray(0,-padding);
  if(raw.length<20) throw new Error('Invalid length');
  const length=raw.readUInt32BE(16);
  if(20+length>raw.length || raw.subarray(20+length).toString()!==corpId) throw new Error('Invalid recipient');
  return raw.subarray(20,20+length).toString('utf8');
}
function encrypt(xml,keyValue,corpId) {
  const key=aesKey(keyValue), body=Buffer.from(xml), size=Buffer.alloc(4);size.writeUInt32BE(body.length);
  let raw=Buffer.concat([randomBytes(16),size,body,Buffer.from(corpId)]);
  const pad=32-raw.length%32;raw=Buffer.concat([raw,Buffer.alloc(pad,pad)]);
  const c=createCipheriv('aes-256-cbc',key,key.subarray(0,16));c.setAutoPadding(false);
  return Buffer.concat([c.update(raw),c.final()]).toString('base64');
}
function field(xml,name) {
  if(typeof xml!=='string' || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid XML');
  const matches=[...xml.matchAll(new RegExp('<'+name+'>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))</'+name+'>','g'))];
  if(matches.length!==1) throw new Error('Missing or duplicate field');
  return matches[0][1] ?? matches[0][2].replace(/&(lt|gt|amp|quot|apos);/g,(_,e)=>({lt:'<',gt:'>',amp:'&',quot:'"',apos:"'"}[e]));
}
module.exports={signature,verify,decrypt,encrypt,field};
