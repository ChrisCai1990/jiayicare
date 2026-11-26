import { useEffect, useRef, useState } from 'react';
import Taro, { useDidHide } from '@tarojs/taro';
import { ttsAPI } from '../services/api';
import { ensureAiDataConsent } from '../utils/aiDataConsent';

export default function useGroupReadAloud() {
  const active = useRef(null);
  const [status, setStatus] = useState(null);

  function stop() {
    const player = active.current?.player;
    active.current = null;
    if (player) {
      player.stop();
      player.destroy();
    }
    setStatus(null);
  }

  useDidHide(stop);
  useEffect(() => stop, []);

  async function toggle(id, text) {
    const sameMessage = active.current?.id === id;
    stop();
    if (sameMessage) return;
    const request = { id };
    active.current = request;
    setStatus({ id, playing:false });
    try {
      const allowed = await ensureAiDataConsent('speech');
      if (active.current !== request) return;
      if (!allowed) { stop(); return; }
      const result = await ttsAPI.synthesize(text.trim(), 'message');
      if (active.current !== request) return;
      if (!result?.url) throw new Error('未生成朗读语音');
      const player = Taro.createInnerAudioContext();
      request.player = player;
      player.onPlay(() => { if (active.current === request) setStatus({ id, playing:true }); });
      player.onEnded(() => { if (active.current === request) stop(); });
      player.onError(() => {
        if (active.current !== request) return;
        stop();
        Taro.showToast({title:'朗读播放失败，请重试',icon:'none'});
      });
      player.src = result.url;
      player.play();
    } catch (error) {
      if (active.current !== request) return;
      stop();
      Taro.showToast({title:error.message || '朗读失败，请重试',icon:'none'});
    }
  }

  function label(id) {
    if (status?.id !== id) return '🔊 朗读';
    return status.playing ? '播放中，点击停止' : '正在生成语音…';
  }
  return { toggle, label };
}
