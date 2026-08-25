const https = require('https');
const { fetchNlsToken, ttsEnabled } = require('./tts');

function asrEnabled() {
  return ttsEnabled();
}

function audioFormat(mimeType = '') {
  const mime = String(mimeType).toLowerCase();
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('mp4') || mime.includes('aac')) return 'aac';
  return 'mp3';
}

function decodeAudioData(data) {
  const encoded = String(data || '').replace(/^data:[^;]+;base64,/, '');
  return Buffer.from(encoded, 'base64');
}

function recognizeAudio(audioBuffer, mimeType, token) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      appkey: process.env.NLS_APP_KEY,
      format: audioFormat(mimeType),
      sample_rate: '16000',
      enable_punctuation_prediction: 'true',
      enable_inverse_text_normalization: 'true',
      // 小程序录音前后常带短暂静音。让一句话识别先定位有效语音，
      // 避免接口返回 SUCCESS 但 result 为空。
      enable_voice_detection: 'true',
    });
    const req = https.request({
      hostname: 'nls-gateway-cn-shanghai.aliyuncs.com',
      path: `/stream/v1/asr?${params.toString()}`,
      method: 'POST',
      headers: {
        'X-NLS-Token': token,
        'Content-Type': 'application/octet-stream',
        'Content-Length': audioBuffer.length,
      },
    }, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.status === 20000000 && parsed.result?.trim()) return resolve(parsed.result.trim());
          reject(new Error(`语音识别失败: ${parsed.message || raw.slice(0, 200)} (status=${parsed.status || 'unknown'}, task=${parsed.task_id || 'unknown'})`));
        } catch (error) {
          reject(new Error(`语音识别响应异常: ${raw.slice(0, 200) || error.message}`));
        }
      });
    });
    req.setTimeout(15000, () => req.destroy(new Error('语音识别超时')));
    req.on('error', reject);
    req.end(audioBuffer);
  });
}

async function transcribeBase64(data, mimeType) {
  if (!asrEnabled()) return '';
  const audioBuffer = decodeAudioData(data);
  if (!audioBuffer.length) return '';
  return recognizeAudio(audioBuffer, mimeType, await fetchNlsToken());
}

module.exports = { transcribeBase64, asrEnabled, audioFormat, decodeAudioData };
