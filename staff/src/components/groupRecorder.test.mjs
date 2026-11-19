import test from 'node:test'
import assert from 'node:assert/strict'
import { browserRecorder, nativeRecorderAvailable } from './groupRecorder.js'

test('staff Android recording uses native WAV bridge and returns the captured audio', async () => {
  const calls = []
  globalThis.window = {
    __JIAYI_NATIVE_AUDIO_KEY: 'session-key',
    StaffNativeAudio: {
      start(key) { calls.push(['start', key]); return 'ok' },
      stop(key, cancel) {
        calls.push(['stop', key, cancel])
        return JSON.stringify({ data: 'data:audio/wav;base64,UklGRg==', mimeType: 'audio/wav', duration: 1.2 })
      },
    },
  }
  try {
    assert.equal(nativeRecorderAvailable(), true)
    let captured
    const recorder = await browserRecorder(audio => { captured = audio })
    await recorder.stop(false)
    assert.equal(captured.mimeType, 'audio/wav')
    assert.equal(captured.duration, 1.2)
    assert.deepEqual(calls, [['start', 'session-key'], ['stop', 'session-key', false]])
  } finally { delete globalThis.window }
})
