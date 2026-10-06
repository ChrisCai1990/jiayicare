const fs = require('node:fs/promises');
const path = require('node:path');

const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(__dirname, '../../../uploads');
const IMAGE_PROMPT = '这些是本轮医护人员上传的报告原图。请按第1张、第2张等逐张读取，只抄录图片中实际可辨认的报告日期、项目名称、结果数值、单位、参考范围和异常标记。重点完整核对铁蛋白、血红蛋白及贫血相关指标。不同图片可能属于同一报告，不要把不同日期或不同人的数据混合。看不清的字段明确写“无法辨认”，不要猜测；不要做诊断。';

function uploadFilename(file) {
  const url = String(file?.url || '');
  if (!/^\/api\/uploads\/[A-Za-z0-9._-]+$/.test(url)) throw new Error('研判图片地址无效，请重新上传');
  const name = url.slice('/api/uploads/'.length);
  if (name === '.' || name === '..' || name.includes('..')) throw new Error('研判图片地址无效，请重新上传');
  return name;
}

function imageMime(buffer) {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buffer.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  throw new Error('研判附件不是可识别的图片，请上传 JPG、PNG、WebP 或 GIF');
}

async function readAttachmentImages(attachments = []) {
  if (!attachments.length) return '';
  const images = [];
  let totalBytes = 0;
  for (const file of attachments.slice(0, 6)) {
    const name = uploadFilename(file);
    const buffer = await fs.readFile(path.join(UPLOADS_DIR, name)).catch(error => {
      if (error.code === 'ENOENT') throw new Error('原图片已不存在，请重新上传');
      throw error;
    });
    if (buffer.length > 12 * 1024 * 1024) throw new Error('研判图片超过识别上限，请压缩后重新上传');
    totalBytes += buffer.length;
    if (totalBytes > 24 * 1024 * 1024) throw new Error('本轮图片总大小超过识别上限，请分批发送');
    const mime = imageMime(buffer);
    images.push(`data:${mime};base64,${buffer.toString('base64')}`);
  }
  const reading = await require('./ai').parseImage(images, IMAGE_PROMPT, { model: 'qwen-vl-plus', maxTokens: 4000, timeoutMs: 120000 });
  if (!String(reading || '').trim()) throw new Error('图片识别未返回内容，请重试或上传更清晰的原图');
  return `以下是本轮报告原图的视觉识别文字，数值和归属仍需人工对照原图核实：\n${String(reading).trim()}`;
}

module.exports = { readAttachmentImages, uploadFilename, imageMime };
