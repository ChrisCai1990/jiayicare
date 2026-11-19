const { getObjectStream, urlToKey } = require('./oss');
const { TYPES } = require('./chatFile');

async function sendChatFile(res, message) {
  const extension = String(message.fileName || '').split('.').pop().toLowerCase();
  const mimeType = TYPES[extension];
  const key = urlToKey(message.fileUrl);
  if (!mimeType || !key) return res.status(404).json({ success: false, message: '文件不存在' });

  const object = await getObjectStream(key);
  const headers = object.res?.headers || {};
  res.set('Content-Type', mimeType);
  res.set('Content-Disposition', `attachment; filename="chat-file.${extension}"`);
  res.set('Cache-Control', 'private, no-store');
  if (headers['content-length']) res.set('Content-Length', headers['content-length']);
  object.stream.on('error', () => { if (!res.headersSent) res.status(502).end(); else res.destroy(); });
  object.stream.pipe(res);
}

module.exports = { sendChatFile };
