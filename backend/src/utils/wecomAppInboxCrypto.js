const {createCipheriv,createDecipheriv,randomBytes}=require('crypto');
function key(){const k=process.env.WECOM_APP_INBOX_KEY;if(!/^[a-f0-9]{64}$/.test(k || ''))throw new Error('Inbox encryption not configured');return Buffer.from(k,'hex');}
function seal(value){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key(),iv);const data=Buffer.concat([c.update(value,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),data]).toString('base64');}
function open(value){const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8');}
module.exports={seal,open};
