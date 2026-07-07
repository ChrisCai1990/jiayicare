const OSS = require('ali-oss');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const heicConvert = require('heic-convert');

// 苹果设备拍照默认输出 HEIC/HEIF，除 Safari 外绝大多数浏览器（Chrome/Edge/Firefox及部分安卓设备）
// 无法直接用 <img> 渲染该格式，会显示破图——2026-07-07 反馈"审核弹窗看不到原图"根因即此。
// 存储前统一转成 JPEG，从源头解决跨设备兼容性问题，不依赖前端判断浏览器能力。
// 供 OSS 上传路径和直存 base64 路径（医护端体检报告）共用。
async function convertHeicBufferIfNeeded(buffer, mimeType) {
  if (mimeType !== 'image/heic' && mimeType !== 'image/heif') return { buffer, mimeType };
  try {
    const converted = await heicConvert({ buffer, format: 'JPEG', quality: 0.9 });
    return { buffer: Buffer.from(converted), mimeType: 'image/jpeg' };
  } catch (e) {
    // 转换失败（极少数非标准HEIC）则按原格式返回，不阻断上传流程
    return { buffer, mimeType };
  }
}

// 转换 data URL 形式的 base64（用于直接存 MongoDB 的场景，不经过 OSS）
async function convertHeicBase64IfNeeded(base64Data, mimeType) {
  if (mimeType !== 'image/heic' && mimeType !== 'image/heif') return { content: base64Data, mimeType };
  const raw = base64Data.replace(/^data:[^;]+;base64,/, '');
  const { buffer, mimeType: newMime } = await convertHeicBufferIfNeeded(Buffer.from(raw, 'base64'), mimeType);
  if (newMime === mimeType) return { content: base64Data, mimeType }; // 转换失败，原样返回
  return { content: `data:${newMime};base64,${buffer.toString('base64')}`, mimeType: newMime };
}

// 上传 base64 内容到 OSS，返回公开访问 URL
async function uploadBase64(base64Data, mimeType, folder = 'reports') {
  const client = getClient();

  const raw = base64Data.replace(/^data:[^;]+;base64,/, '');
  const rawBuffer = Buffer.from(raw, 'base64');
  const { buffer, mimeType: effectiveMime } = await convertHeicBufferIfNeeded(rawBuffer, mimeType);

  const ext = effectiveMime === 'application/pdf' ? 'pdf'
    : effectiveMime === 'image/png' ? 'png'
    : effectiveMime === 'image/jpeg' || effectiveMime === 'image/jpg' ? 'jpg'
    : effectiveMime === 'audio/mpeg' ? 'mp3'
    : 'bin';

  const key = `${folder}/${uuidv4()}.${ext}`;
  await client.put(key, buffer, { mime: effectiveMime });

  const endpoint = process.env.OSS_ENDPOINT || 'https://oss-cn-beijing.aliyuncs.com';
  const bucket = process.env.OSS_BUCKET;
  const url = `https://${bucket}.${endpoint.replace('https://', '')}/${key}`;
  return { url, key, mimeType: effectiveMime };
}

function getClient() {
  return new OSS({
    region: process.env.OSS_REGION,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET,
  });
}

// 删除 OSS 文件
async function deleteFile(key) {
  try {
    const client = getClient();
    await client.delete(key);
  } catch (e) {
    // 删除失败不阻断流程
  }
}

// 从 OSS URL 提取 key
function urlToKey(url) {
  const bucket = process.env.OSS_BUCKET;
  const match = url.match(new RegExp(`${bucket}[^/]*/(.+)$`));
  return match ? match[1] : null;
}

module.exports = { uploadBase64, deleteFile, urlToKey, convertHeicBase64IfNeeded };
