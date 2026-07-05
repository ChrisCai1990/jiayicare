const OSS = require('ali-oss');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

function getClient() {
  return new OSS({
    region: process.env.OSS_REGION,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET,
  });
}

// 上传 base64 内容到 OSS，返回公开访问 URL
async function uploadBase64(base64Data, mimeType, folder = 'reports') {
  const client = getClient();

  const raw = base64Data.replace(/^data:[^;]+;base64,/, '');
  const buffer = Buffer.from(raw, 'base64');

  const ext = mimeType === 'application/pdf' ? 'pdf'
    : mimeType === 'image/png' ? 'png'
    : mimeType === 'image/jpeg' || mimeType === 'image/jpg' ? 'jpg'
    : mimeType === 'audio/mpeg' ? 'mp3'
    : 'bin';

  const key = `${folder}/${uuidv4()}.${ext}`;
  await client.put(key, buffer, { mime: mimeType });

  const endpoint = process.env.OSS_ENDPOINT || 'https://oss-cn-beijing.aliyuncs.com';
  const bucket = process.env.OSS_BUCKET;
  const url = `https://${bucket}.${endpoint.replace('https://', '')}/${key}`;
  return { url, key };
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

module.exports = { uploadBase64, deleteFile, urlToKey };
