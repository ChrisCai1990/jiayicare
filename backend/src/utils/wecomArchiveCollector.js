const { spawn } = require('child_process');
const path = require('path');
const { createHmac, randomUUID } = require('crypto');
const { createDraft } = require('./groupFollowupDraft');
const Cursor = require('../models/WecomArchiveCursor');
const Group = require('../models/ServiceGroup');
let tokenCache;

function sdk(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.WECOM_ARCHIVE_PYTHON || 'python3', [path.resolve(__dirname, '../../scripts/wecom_archive_sdk.py')], { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = []; let bytes = 0; let settled = false;
    const fail = () => { if (!settled) { settled = true; clearTimeout(timer); reject(new Error('archive_sdk_failed')); } };
    const timer = setTimeout(() => { child.kill(); fail(); }, 120000);
    child.on('error', fail);
    child.stdout.on('data', b => { bytes += b.length; if (bytes > 16 * 1024 * 1024) { child.kill(); fail(); } else chunks.push(b); });
    child.stderr.on('data', () => {}); // Never log plaintext, credentials, SDK stderr, or raw responses.
    child.on('close', code => {
      if (settled) return;
      if (code) return fail();
      clearTimeout(timer); settled = true;
      try { const result = JSON.parse(Buffer.concat(chunks).toString()); if (result.error) throw Error(); resolve(result); }
      catch { reject(new Error('archive_sdk_response')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(request));
  });
}

async function archiveApi(method, body) {
  if (!tokenCache || tokenCache.until < Date.now()) {
    const r = await fetch('https://qyapi.weixin.qq.com/cgi-bin/gettoken?' + new URLSearchParams({ corpid: process.env.WECOM_CORP_ID, corpsecret: process.env.WECOM_ARCHIVE_SECRET }), { signal: AbortSignal.timeout(15000) });
    const a = await r.json();
    if (!r.ok || !a.access_token) throw new Error('archive_token');
    tokenCache = { token: a.access_token, until: Date.now() + Math.max(0, a.expires_in - 120) * 1000 };
  }
  const r = await fetch('https://qyapi.weixin.qq.com/cgi-bin/msgaudit/' + method + '?access_token=' + encodeURIComponent(tokenCache.token), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const a = await r.json();
  if (!r.ok || a.errcode) { tokenCache = null; throw new Error('archive_permission_api'); }
  return a;
}

function consentAllows(message, info) {
  // Fail closed for missing, unknown or refused external consent, including staff-authored messages.
  if (!Array.isArray(info) || !info.length) return false;
  return info.every(row => row.agree_status === 'Agree' && Number(row.status_change_time) * 1000 <= Number(message.msgtime));
}

async function bridge(body) {
  const raw = JSON.stringify(body), timestamp = String(Date.now());
  const signature = createHmac('sha256', process.env.SERVICE_GROUP_BRIDGE_SECRET).update(timestamp + '.' + raw).digest('hex');
  const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/api/integrations/service-groups/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-jy-timestamp': timestamp, 'x-jy-signature': signature }, body: raw, signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error('archive_bridge_' + response.status);
  return response.json();
}

async function tick({ sdk: fetchSdk = sdk, archiveApi: fetchApi = archiveApi, bridge: sendBridge = bridge, createDraft: makeDraft = createDraft, Cursor: C = Cursor, Group: G = Group } = {}) {
  const owner = randomUUID(), tenantId = process.env.SERVICE_GROUP_BRIDGE_TENANT_ID || null;
  await C.updateOne({ _id: 'primary' }, { $setOnInsert: { seq: 0 } }, { upsert: true });
  const cursor = await C.findOneAndUpdate({ _id: 'primary', $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lt: new Date() } }] }, { $set: { leaseOwner: owner, leaseUntil: new Date(Date.now() + 300000) } }, { new: true });
  if (!cursor) return;
  const counters = { fetched: 0, stored: 0, draftCreated: 0, draftUpdated: 0, skippedScope: 0, skippedConsent: 0, unsupported: 0 };
  const heartbeat = setInterval(() => C.updateOne({ _id: 'primary', leaseOwner: owner }, { $set: { leaseUntil: new Date(Date.now() + 300000) } }).catch(() => {}), 30000);
  try {
    const groups = await G.find({ tenantId, archiveConsent: true, chatId: { $gt: '' } }).lean();
    const rows = (await fetchSdk({ seq: cursor.seq })).rows;
    if (!Array.isArray(rows)) throw new Error('archive_rows');
    counters.fetched = rows.length;
    const consents = new Map();
    for (const row of rows) {
      if (!Number.isSafeInteger(row.seq) || row.seq <= cursor.seq) throw new Error('archive_sequence');
      const m = row.message, g = groups.find(g => g.chatId === m.roomid);
      if (!g || m.action !== 'send') counters.skippedScope++;
      else {
        if (!consents.has(m.roomid)) consents.set(m.roomid, (await fetchApi('check_room_agree', { roomid: m.roomid })).agreeinfo);
        if (!consentAllows(m, consents.get(m.roomid))) counters.skippedConsent++;
        else if (Date.now() - Number(m.msgtime) > 30 * 86400000 || Number(m.msgtime) > Date.now() + 300000) counters.skippedScope++;
        else {
          let text = m.msgtype === 'text' ? m.text?.content : '';
          let file;
          if (['image', 'file'].includes(m.msgtype)) {
            const media = m[m.msgtype];
            const supported = m.msgtype === 'image' || /\.(pdf|png|jpg|jpeg|webp)$/i.test(media?.filename || '');
            if (supported && media?.sdkfileid && (!media.filesize || media.filesize <= 9 * 1024 * 1024)) {
              const data = await fetchSdk({ action: 'media', fileId: media.sdkfileid });
              if (data.base64 && require('./serviceGroupRules').fileMime(Buffer.from(data.base64, 'base64'))) file = { base64: data.base64, name: media.filename || '群图片' };
            }
            text = file ? '' : '收到附件，请在企业微信中查看原件（格式或大小暂不支持导入）。';
          }
          if (!text && !file) counters.unsupported++;
          else {
            // Recheck local authorization immediately before persistence.
            const current = await G.findOne({ _id: g._id, tenantId, archiveConsent: true, chatId: m.roomid }).lean();
            if (!current) throw new Error('archive_authorization_changed');
            const body = { chatId: m.roomid, messageId: m.msgid, sender: m.from, sentAt: new Date(Number(m.msgtime)).toISOString(), text: String(text || '').slice(0, 20000), consent: true, ...(file ? { file } : {}) };
            const response = await sendBridge(body);
            if (!response.data?.duplicate) counters.stored++;
            if (process.env.SERVICE_GROUP_FOLLOWUP_DRAFT_ENABLED === 'true' && m.msgtype === 'text') {
              const result = await makeDraft(current, { ...body, referencedMessageId: m.quote?.msgid || null });
              if (result === 'created') counters.draftCreated++;
              if (result === 'updated') counters.draftUpdated++;
            }
          }
        }
      }
      const updated = await C.updateOne({ _id: 'primary', leaseOwner: owner }, { $set: { seq: row.seq } });
      if (!updated.matchedCount) throw new Error('archive_lease_lost');
      cursor.seq = row.seq;
    }
    await C.updateOne({ _id: 'primary', leaseOwner: owner }, { $set: { lastSuccessAt: new Date(), lastError: '', counters } });
  } catch (error) {
    const code = /^archive_[a-z0-9_]+$/.test(error.message) ? error.message : 'archive_failed';
    await C.updateOne({ _id: 'primary', leaseOwner: owner }, { $set: { lastErrorAt: new Date(), lastError: code, counters } });
    throw new Error(code);
  } finally {
    clearInterval(heartbeat);
    await C.updateOne({ _id: 'primary', leaseOwner: owner }, { $unset: { leaseOwner: 1, leaseUntil: 1 } });
  }
}

module.exports = { tick, consentAllows };
