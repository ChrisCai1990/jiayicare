const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('H5 recorder sends a real data URL and releases microphone tracks', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/utils/h5Audio.js'), 'utf8');
  const { createH5Recorder } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previous = { MediaRecorder: global.MediaRecorder, FileReader: global.FileReader };
  let trackStopped = false;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: () => { trackStopped = true; } }] }) } } });
  global.MediaRecorder = class {
    static isTypeSupported(type) { return type === 'audio/webm'; }
    constructor() { this.mimeType = 'audio/webm;codecs=opus'; this.state = 'inactive'; }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable({ data: new Blob(['voice'], { type: 'audio/webm' }) });
      this.onstop();
    }
  };
  global.FileReader = class {
    readAsDataURL() { this.result = 'data:audio/webm;codecs=opus;base64,dm9pY2U='; this.onload(); }
  };
  try {
    const recorder = createH5Recorder();
    const stopped = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('recorder did not stop')), 1000);
      recorder.onStop((value) => { clearTimeout(timer); resolve(value); });
      recorder.onError(reject);
    });
    await recorder.start();
    recorder.stop();
    const result = await stopped;
    assert.equal(result.mimeType, 'audio/webm');
    assert.equal(result.data, 'data:audio/webm;base64,dm9pY2U=');
    assert.equal(trackStopped, true);
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
    else delete globalThis.navigator;
    Object.assign(global, previous);
  }
});
