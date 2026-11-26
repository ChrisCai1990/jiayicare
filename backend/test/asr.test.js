const test = require('node:test');
const assert = require('node:assert/strict');

const { audioFormat, decodeAudioData, transcriptFromResponse } = require('../src/utils/asr');

test('语音 MIME 类型映射到阿里云短语音格式', () => {
  assert.equal(audioFormat('audio/mpeg'), 'mp3');
  assert.equal(audioFormat('audio/wav'), 'wav');
  assert.equal(audioFormat('audio/mp4'), 'aac');
});

test('语音 data URL 可还原为原始字节', () => {
  const source = Buffer.from('voice-test');
  const decoded = decodeAudioData(`data:audio/mpeg;base64,${source.toString('base64')}`);
  assert.deepEqual(decoded, source);
});

test('试用到期返回服务不可用，静音与有效转写分别处理', () => {
  assert.throws(() => transcriptFromResponse({status:40000010, message:'Gateway:FREE_TRIAL_EXPIRED'}), {status:503, code:'ASR_SUBSCRIPTION_EXPIRED'});
  assert.equal(transcriptFromResponse({status:20000000, result:''}), '');
  assert.equal(transcriptFromResponse({status:20000000, result:'早上好'}), '早上好');
});
