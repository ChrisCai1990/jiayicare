import { Audio } from 'expo-av';
import { ttsAPI } from '../services/api';

let currentSound = null;

// 停止当前正在播放的语音（切换页面/新播报打断上一个）
async function stop() {
  if (currentSound) {
    try { await currentSound.stopAsync(); await currentSound.unloadAsync(); } catch {}
    currentSound = null;
  }
}

// 朗读一段文本：调后端阿里云语音合成拿到 mp3 url，再播放
// sceneType 用于区分播报场景（如 ai_health_summary / message / reminder），供后端统计与后续扩展
async function speak(text, sceneType) {
  await stop();
  const res = await ttsAPI.synthesize(text, sceneType);
  if (!res.success) throw new Error(res.message || '语音合成失败');

  const { sound } = await Audio.Sound.createAsync({ uri: res.url }, { shouldPlay: true });
  currentSound = sound;
  sound.setOnPlaybackStatusUpdate((status) => {
    if (status.didJustFinish) stop();
  });
  return sound;
}

export default { speak, stop };
