const test = require('node:test');
const assert = require('node:assert/strict');

const { audioFormat, decodeAudioData } = require('../src/utils/asr');

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
