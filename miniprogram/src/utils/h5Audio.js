// Browser equivalents for the Taro mini-program recorder/audio APIs used by MessagesPage.
// They are only instantiated in the H5 bundle; App WebView still needs microphone permission.
export function createH5Recorder() {
  let mediaRecorder = null;
  let stream = null;
  let startedAt = 0;
  let stopRequested = false;
  let durationTimer = null;
  let onStartCallback = () => {};
  let onStopCallback = () => {};
  let onErrorCallback = () => {};
  const release = () => {
    clearTimeout(durationTimer);
    durationTimer = null;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
  };
  return {
    onStart(fn) { onStartCallback = fn; },
    offStart() { onStartCallback = () => {}; },
    onStop(fn) { onStopCallback = fn; },
    offStop() { onStopCallback = () => {}; },
    onError(fn) { onErrorCallback = fn; },
    offError() { onErrorCallback = () => {}; },
    async start() {
      stopRequested = false;
      try {
        if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
          throw new Error('当前设备不支持录音');
        }
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (stopRequested) { release(); return; }
        const mimeType = ['audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
        mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        const currentRecorder = mediaRecorder;
        const chunks = [];
        currentRecorder.ondataavailable = event => { if (event.data?.size) chunks.push(event.data); };
        currentRecorder.onerror = error => { release(); onErrorCallback(error); };
        currentRecorder.onstop = () => {
          const duration = Date.now() - startedAt;
          const blob = new Blob(chunks, { type: currentRecorder.mimeType || mimeType || 'audio/webm' });
          const wireMimeType = blob.type.split(';')[0].toLowerCase();
          release();
          const reader = new FileReader();
          reader.onload = () => {
            // The backend accepts bare audio MIME types and its base64 parser
            // expects the MIME type immediately before ";base64,". Some
            // browsers append codec parameters to MediaRecorder.mimeType.
            const base64 = String(reader.result || '').split(',')[1];
            if (!base64) { onErrorCallback(new Error('录音读取失败')); return; }
            onStopCallback({ data: `data:${wireMimeType};base64,${base64}`, mimeType: wireMimeType, duration });
          };
          reader.onerror = () => onErrorCallback(new Error('录音读取失败'));
          reader.readAsDataURL(blob);
        };
        startedAt = Date.now();
        currentRecorder.start();
        durationTimer = setTimeout(() => {
          if (currentRecorder.state !== 'recording') return;
          currentRecorder.onstop = () => { release(); onErrorCallback(new Error('录音最长60秒，请重试')); };
          currentRecorder.stop();
        }, 60000);
        onStartCallback();
      } catch (error) { release(); onErrorCallback(error); }
    },
    stop() {
      stopRequested = true;
      if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
      else release();
    },
  };
}

export function createH5AudioPlayer() {
  const audio = new Audio();
  return {
    set src(value) { audio.src = value; },
    onPlay(fn) { audio.onplay = fn; },
    onEnded(fn) { audio.onended = fn; },
    onStop(fn) { audio.onpause = fn; },
    onError(fn) { audio.onerror = fn; },
    play() { audio.play().catch(() => audio.onerror?.()); },
    stop() { audio.pause(); audio.currentTime = 0; },
    destroy() { audio.pause(); audio.removeAttribute('src'); audio.load(); },
  };
}
