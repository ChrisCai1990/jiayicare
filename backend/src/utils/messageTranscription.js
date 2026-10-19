const { randomUUID } = require('crypto');
const CONSENT_VERSION = 'voice-text-20261005';
const MAX_BYTES = 9 * 1024 * 1024;

// Only read the private object already attached to an authorized message, never a caller URL.
async function readAudio(storage, url) {
  const key = storage.urlToKey(url);
  if (!key || !/^(messages|chat)\/audio\//.test(key)) throw new Error('语音文件不可用');
  let stream;
  let timer;
  let timedOut = false;
  const work = (async () => {
    const object = await storage.getObjectStream(key);
    stream = object.stream;
    if (timedOut) { stream.destroy(); throw new Error('读取语音超时'); }
    const chunks = []; let size = 0;
    try {
      for await (const chunk of stream) {
        const buffer = Buffer.from(chunk); size += buffer.length;
        if (size > MAX_BYTES) throw new Error('语音文件过大');
        chunks.push(buffer);
      }
      if (!size) throw new Error('语音文件为空');
      return Buffer.concat(chunks).toString('base64');
    } finally { stream.destroy(); }
  })();
  try {
    return await Promise.race([work, new Promise((_, reject) => {
      timer = setTimeout(() => { timedOut = true; stream?.destroy(); reject(new Error('读取语音超时')); }, 20000);
    })]);
  } finally { clearTimeout(timer); }
}

function createHandler({ Message, storage, asr, reviewServices, isReview, visibleQuery, publish }) {
  return async (req, res) => {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id || '')) return res.status(400).json({ success: false, message: '无效消息' });
    if (req.body?.consentVersion !== CONSENT_VERSION) return res.status(400).json({ success: false, message: '请先确认语音转文字说明' });
    const query = { ...visibleQuery(req.user._id), _id: req.params.id, user: req.user._id, type: 'user' };
    let lock;
    let stage = 'message';
    try {
      const message = await Message.findOne(query);
      if (!message?.audioUrl) return res.status(404).json({ success: false, message: '语音不存在或已撤回' });
      if (message.audioTranscript?.trim()) return res.json({ success: true, data: { _id: message._id, audioTranscript: message.audioTranscript } });
      await require('./aiDataConsent').assertPermission(message.user, 'speech', 'aliyun-nls');
      const review = isReview();
      if (review && !reviewServices?.asr?.asrEnabled()) return res.status(403).json({ success: false, message: '审核体验不调用外部语音识别，可播放原语音' });
      const recognition = review ? reviewServices.asr : asr;
      if (!recognition.asrEnabled()) return res.status(503).json({ success: false, message: '转文字暂不可用，可播放原语音' });
      const token = randomUUID();
      const now = new Date();
      lock = await Message.findOneAndUpdate({ $and: [query,
        { $or: [{ audioTranscript: '' }, { audioTranscript: null }] },
        { $or: [{ audioTranscriptionLockUntil: null }, { audioTranscriptionLockUntil: { $lte: now } }] },
      ] }, { $set: {
        audioTranscriptionLockToken: token, audioTranscriptionLockUntil: new Date(now.getTime() + 90000),
        audioTranscriptionConsentVersion: CONSENT_VERSION, audioTranscriptionConsentedAt: now,
        audioTranscriptionRequestedBy: req.user._id, audioTranscriptDisplayOnly: true,
      } }, { new: true });
      if (!lock) return res.status(409).json({ success: false, message: '正在转文字，请稍后查看' });
      stage = 'storage';
      const audio = await readAudio(storage, lock.audioUrl);
      // Re-check recall/ownership after storage I/O and before sending anything to ASR.
      if (!await Message.exists({ ...query, audioTranscriptionLockToken: token })) return res.status(404).json({ success: false, message: '语音已撤回' });
      stage = 'recognition';
      await require('./aiDataConsent').assertPermission(message.user, 'speech', 'aliyun-nls');
      const transcript = String(await require('./aiDataConsent').withPersonalData(message.user, 'speech', () => recognition.transcribeBase64(audio, lock.audioMimeType)) || '').trim();
      if (!transcript || transcript.length > 1000) throw new Error('未识别到有效文字');
      stage = 'save';
      const saved = await Message.findOneAndUpdate({ ...query, audioTranscriptionLockToken: token }, {
        $set: { audioTranscript: transcript }, $unset: { audioTranscriptionLockToken: '', audioTranscriptionLockUntil: '' },
      }, { new: true });
      if (!saved) return res.status(404).json({ success: false, message: '语音已撤回' });
      // Publish only the changed text, never the private OSS URL or consent metadata.
      const data = { _id: saved._id, audioTranscript: transcript, audioTranscriptDisplayOnly: true };
      publish(saved.conversationId, { type: 'message-update', data });
      return res.json({ success: true, data });
    } catch (error) {
      if (error.code === 'AI_DATA_CONSENT_REQUIRED') return res.status(403).json({ success: false, code: error.code, message: error.message });
      const code = /^[A-Z0-9_]{1,50}$/.test(error?.code || '') ? error.code : 'UNEXPECTED';
      console.warn('[voice-transcription-failed]', JSON.stringify({ stage, code }));
      return res.status(502).json({ success: false, message: '转文字未完成，请稍后重试；原语音仍可播放' });
    } finally {
      if (lock) await Message.updateOne({ _id: lock._id, audioTranscriptionLockToken: lock.audioTranscriptionLockToken }, {
        $unset: { audioTranscriptionLockToken: '', audioTranscriptionLockUntil: '' },
      }).catch(() => {});
    }
  };
}

async function handler(req, res, publish) {
  return createHandler({ Message: require('../models/Message'), storage: require('./oss'), asr: require('./asr'),
    isReview: () => process.env.REVIEW_ENVIRONMENT === 'isolated',
    visibleQuery: require('./messageInbox').visibleMessageQuery, publish })(req, res);
}
module.exports = { handler, createHandler, readAudio, CONSENT_VERSION };
