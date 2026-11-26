const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const { isIP } = require('node:net');

const tables = new Map();
function regionForIP(value) {
  const ip = String(value || '').replace(/^::ffff:(?=\d+\.)/i, '');
  const version = isIP(ip);
  if (!version || ip.includes('%')) return '';
  const width = version === 4 ? 4 : 16;
  let key;
  if (version === 4) key = Buffer.from(ip.split('.').map(Number));
  else {
    const canonical = new URL('http://[' + ip + ']').hostname.slice(1, -1);
    const [head, tail] = canonical.split('::').map(part => part ? part.split(':') : []);
    const words = tail ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail] : head;
    key = Buffer.from(words.map(word => word.padStart(4, '0')).join(''), 'hex');
  }
  if (!tables.has(version)) {
    const base = path.join(__dirname, '../data/login-region', 'v' + version);
    tables.set(version, { rows: gunzipSync(fs.readFileSync(base + '.gz')), names: require(base + '.json') });
  }
  const { rows, names } = tables.get(version);
  const stride = width * 2 + 2;
  let low = 0, high = rows.length / stride - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2), at = mid * stride;
    if (key.compare(rows, at, at + width) < 0) high = mid - 1;
    else if (key.compare(rows, at + width, at + 2 * width) > 0) low = mid + 1;
    else return names[rows.readUInt16BE(at + 2 * width)];
  }
  return '';
}

const clients = { weapp: '微信小程序', android: 'Android App', ios: 'iOS App', app: 'App', h5: 'H5 网页' };
const channels = { official_site: '官网服务入口', wechat_service: '微信客服', partner: '合作机构转介', staff_referral: '工作人员转介' };
function describeEntry(entry) {
  if (!entry) return '';
  const scene = Number(entry.scene);
  let label = '';
  if ([1005,1006,1027].includes(scene)) label = '微信搜索';
  if ([1011,1012,1013,1047,1048,1049].includes(scene)) label = '扫码或识别二维码';
  if (scene === 1007) label = '好友分享';
  if (scene === 1008) label = '群聊分享';
  if (scene === 1089) label = '微信聊天页下拉入口';
  if (!label && Number.isInteger(scene) && scene >= 1000 && scene <= 9999) label = '微信场景 ' + scene;
  const channel = Object.hasOwn(channels, entry.channel) ? channels[entry.channel] : '';
  return [label, channel].filter(Boolean).join(' · ');
}

function normalizeOrigin(input) {
  if (!input || typeof input.client !== 'string' || !Object.hasOwn(clients, input.client)) return undefined;
  const entry = source => {
    if (!source || typeof source !== 'object') return undefined;
    const scene = input.client === 'weapp' && Number.isInteger(source.scene) && source.scene >= 1000 && source.scene <= 9999 ? source.scene : 0;
    const channel = typeof source.channel === 'string' && Object.hasOwn(channels, source.channel) ? source.channel : '';
    return scene || channel ? { scene, channel } : undefined;
  };
  return { client: input.client, firstEntry: entry(input.firstEntry), recentEntry: entry(input.recentEntry) };
}

function phoneModel(session) {
  const reported = session.device?.model;
  const androidBuild = /Android [^;)]+;[^)]*?;?\s*([^;()]+?)\s+Build\//i.exec(session.userAgent || '');
  for (const candidate of [reported, androidBuild?.[1]]) {
    if (typeof candidate !== 'string') continue;
    const model = candidate.trim();
    if (!model || model.length > 96 || /^(unknown|undefined|null|iphone|ipad|android|k|pc|windows|mac|linux|web|devtools|未知)$/i.test(model)) continue;
    if (!/[a-z0-9\u4e00-\u9fff]/i.test(model) || /[;()<>\x00-\x1f]/.test(model)) continue;
    return model;
  }
  return '';
}

function summarizeSession(session, first) {
  if (!session) return {};
  const origin = normalizeOrigin(session.device?.loginOrigin) || {};
  let client = Object.hasOwn(clients, origin.client) ? clients[origin.client] : '';
  if (!client && (session.method === 'wechat' || /miniProgram/i.test(session.userAgent || ''))) client = clients.weapp;
  return { client, model: first ? phoneModel(session) : undefined, entry: describeEntry(first ? origin.firstEntry : origin.recentEntry), at: session.loginAt,
    region: first ? regionForIP(session.ip) : '' };
}

function loginIP(req) {
  const peer = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  const forwarded = req.headers['x-real-ip'];
  return ['127.0.0.1','::1'].includes(peer) && isIP(String(forwarded || '')) ? forwarded : peer;
}
module.exports = { regionForIP, describeEntry, summarizeSession, loginIP, normalizeOrigin, phoneModel };
