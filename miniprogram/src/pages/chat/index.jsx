import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Textarea, ScrollView, Input, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius } from '../../theme';
import { chatAPI, mediaUrl } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import useNavBar from '../../hooks/useNavBar';
import Icon from '../../components/Icon';
import MessagesPage from '../messages/index';
import { chooseImageWithPrivacy, showImagePickerError } from '../../utils/imagePicker';

const QUICK_PROMPTS = ['我想了解体检服务', '帮家人找合适的服务', '我还不确定需要什么服务'];
const PLANNER_GREETING = { role: 'assistant', content: '您好，我是AI健康规划师。我会先了解服务对象、所在城市、时间和预算偏好，再从平台已上架的产品中帮您筛选；如果暂时无法准确匹配，我会为您转接真人健康规划师。您这次想为谁了解哪类服务？' };

// 小嘉健康规划师：仅梳理健康管理需求与规划平台服务，不提供医疗咨询。
export default function ChatPage() {
  const { statusBarHeight } = useNavBar();
  const { user } = useAuth();
  const [messages, setMessages] = useState([PLANNER_GREETING]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [plannerImage, setPlannerImage] = useState(null);
  const [plannerVoiceMode, setPlannerVoiceMode] = useState(false);
  const [plannerEmojiOpen, setPlannerEmojiOpen] = useState(false);
  const [plannerMoreOpen, setPlannerMoreOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [visiblePlannerTranscripts, setVisiblePlannerTranscripts] = useState(new Set());
  const plannerRecorderRef = useRef(null);
  const plannerRecordingTimerRef = useRef(null);
  const plannerAudioRef = useRef(null);
  const [view, setView] = useState('team');
  const [nutritionMessages, setNutritionMessages] = useState([
    { role: 'assistant', content: '您好，我是AI营养师。您可以描述今天吃了什么、记录体重，或拍一张饮食照片，我会立即做初步分析。' },
  ]);
  const [nutritionInput, setNutritionInput] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [foodImage, setFoodImage] = useState(null);
  const [plannerScrollTop, setPlannerScrollTop] = useState(999998);
  const historyUserRef = useRef('');

  // 与 App 端保持一致：进入规划师时从后端恢复最近 50 轮对话。
  // 对话记录按登录用户查询，既能跨页面/重启保留，也不会在切换账号时串话。
  useEffect(() => {
    if (!user?._id || historyUserRef.current === user._id) return;
    const historyUserId = user._id;
    historyUserRef.current = historyUserId;
    setMessages([PLANNER_GREETING]);
    chatAPI.getLogs(historyUserId).then((res) => {
      if (historyUserRef.current !== historyUserId) return;
      if (!res?.success || !Array.isArray(res.data) || res.data.length === 0) return;
      const historyMessages = [...res.data].reverse().flatMap((log) => [
        log.userMessage ? { role: 'user', content: log.userMessage, image: log.imageUrl, audioUrl: log.audioUrl, audioDuration: log.audioDuration, audioTranscript: log.audioTranscript } : null,
        log.aiReply ? { role: 'assistant', content: log.aiReply } : null,
      ].filter(Boolean));
      setMessages([PLANNER_GREETING, ...historyMessages]);
    }).catch(() => {});
  }, [user?._id]);

  useDidShow(() => {
    const requestedView = Taro.getStorageSync('healthHubView');
    if (requestedView === 'team') setView('team');
    Taro.removeStorageSync('healthHubView');
  });

  // 真机上长对话必须让 ScrollView 自身滚动，不能把整个页面撑高。
  // 历史记录和 AI 回复渲染后分两次定位，保证输入栏始终留在底部。
  useEffect(() => {
    if (view !== 'ai') return undefined;
    const jumpToLatest = () => setPlannerScrollTop((value) => (value === 999999 ? 999998 : 999999));
    const layoutTimer = setTimeout(jumpToLatest, 80);
    const settleTimer = setTimeout(jumpToLatest, 420);
    return () => {
      clearTimeout(layoutTimer);
      clearTimeout(settleTimer);
    };
  }, [view, messages.length, sending]);

  useEffect(() => () => {
    clearInterval(plannerRecordingTimerRef.current);
    plannerRecorderRef.current?.stop?.();
    plannerAudioRef.current?.destroy?.();
  }, []);

  const send = async (audio = null) => {
    const text = input.trim();
    if ((!text && !plannerImage && !audio) || sending) return;
    const currentImage = plannerImage;
    const content = text || (audio ? '[语音消息]' : '图片记录');
    const userMessage = {
      role: 'user', content, image: currentImage?.path,
      audioUrl: audio?.tempFilePath, audioDuration: Math.max(1, Math.ceil((audio?.duration || 0) / 1000)),
    };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput('');
    setPlannerImage(null);
    setSending(true);
    try {
      let audioPayload = null;
      if (audio?.tempFilePath) {
        const base64 = Taro.getFileSystemManager().readFileSync(audio.tempFilePath, 'base64');
        audioPayload = { data: `data:audio/mpeg;base64,${base64}`, mimeType: 'audio/mpeg', duration: userMessage.audioDuration };
      }
      const res = await chatAPI.send(next, { name: user?.name }, {
        image: currentImage?.data || '', mimeType: currentImage?.mimeType || 'image/jpeg', audio: audioPayload,
      });
      const reply = res?.data?.content || res?.content || '抱歉，我暂时无法回复，请稍后重试。';
      const audioTranscript = res?.data?.audioTranscript || '';
      setMessages((current) => {
        const updated = audioTranscript ? current.map((message, index) => (
          index === current.length - 1 && message.role === 'user' ? { ...message, audioTranscript } : message
        )) : current;
        return [...updated, { role: 'assistant', content: reply }];
      });
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: `请求失败：${err.message || '网络异常'}` }]);
    } finally {
      setSending(false);
    }
  };

  const choosePlannerImage = async () => {
    try {
      const result = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const path = result.tempFilePaths?.[0];
      if (!path) return;
      const base64 = Taro.getFileSystemManager().readFileSync(path, 'base64');
      const ext = (path.split('.').pop() || 'jpg').toLowerCase();
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      setPlannerImage({ path, mimeType, data: `data:${mimeType};base64,${base64}` });
    } catch (err) {
      if (!/cancel/i.test(err?.errMsg || '')) Taro.showToast({ title: '无法读取图片', icon: 'none' });
    }
  };

  const startPlannerRecording = () => {
    if (sending || recording) return;
    setRecordingSeconds(0);
    const recorder = plannerRecorderRef.current || Taro.getRecorderManager();
    plannerRecorderRef.current = recorder;
    recorder.offStart?.(); recorder.offError?.();
    recorder.onStart(() => {
      setRecording(true);
      clearInterval(plannerRecordingTimerRef.current);
      plannerRecordingTimerRef.current = setInterval(() => setRecordingSeconds((value) => Math.min(60, value + 1)), 1000);
    });
    recorder.onError(() => {
      clearInterval(plannerRecordingTimerRef.current);
      setRecording(false);
      Taro.showToast({ title: '请允许使用麦克风', icon: 'none' });
    });
    recorder.start({ duration: 60000, format: 'mp3', sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000 });
  };

  const stopPlannerRecording = () => {
    const recorder = plannerRecorderRef.current;
    if (!recorder || !recording) return;
    clearInterval(plannerRecordingTimerRef.current);
    recorder.offStop?.();
    recorder.onStop((result) => {
      setRecording(false);
      if ((result?.duration || 0) < 600) {
        Taro.showToast({ title: '说话时间太短', icon: 'none' });
        return;
      }
      send(result);
    });
    recorder.stop();
  };

  const playPlannerVoice = (url) => {
    plannerAudioRef.current?.destroy?.();
    const player = Taro.createInnerAudioContext();
    plannerAudioRef.current = player;
    player.src = mediaUrl(url);
    player.play();
  };

  const choosePrompt = (text) => {
    setInput(text);
  };

  const chooseFoodImage = async () => {
    try {
      const result = await chooseImageWithPrivacy({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const path = result.tempFilePaths?.[0];
      if (!path) return;
      const base64 = Taro.getFileSystemManager().readFileSync(path, 'base64');
      const ext = (path.split('.').pop() || 'jpg').toLowerCase();
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      setFoodImage({ path, mimeType, data: `data:${mimeType};base64,${base64}` });
    } catch (err) {
      showImagePickerError(err);
    }
  };

  const sendNutrition = async () => {
    const text = nutritionInput.trim();
    const weight = weightInput.trim();
    if ((!text && !weight && !foodImage) || sending) return;
    const summary = [text, weight ? `体重 ${weight}kg` : '', foodImage ? '已上传饮食照片' : ''].filter(Boolean).join(' · ');
    const currentImage = foodImage;
    setNutritionMessages((prev) => [...prev, { role: 'user', content: summary, image: currentImage?.path }]);
    setNutritionInput(''); setWeightInput(''); setFoodImage(null); setSending(true);
    try {
      const res = await chatAPI.analyzeNutrition({
        text, weight: weight || null, image: currentImage?.data || '', mimeType: currentImage?.mimeType || 'image/jpeg',
      });
      setNutritionMessages((prev) => [...prev, { role: 'assistant', content: res?.data?.content || '已完成初步分析。' }]);
    } catch (err) {
      setNutritionMessages((prev) => [...prev, { role: 'assistant', content: err.message || '营养分析失败，请稍后重试。' }]);
    } finally { setSending(false); }
  };

  return (
    <View style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: colors.background }}>
      <View style={{
        padding: `${statusBarHeight + 10}px ${spacing.lg}px ${spacing.sm}px`,
        backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`, flexShrink: 0,
      }}>
        <View style={{ display: 'flex', alignItems: 'center', minHeight: '30px' }}>
          {view === 'ai' && <Text onClick={() => setView('team')} style={{ fontSize: '14px', color: colors.primary, marginRight: '10px' }}>‹ 返回</Text>}
          <Text style={{ fontSize: '20px', fontWeight: 800, color: colors.textPrimary }}>{view === 'ai' ? 'AI健康规划师' : '健康管家'}</Text>
        </View>
      </View>

      {/* 两个区域同时挂载：团队消息进入页面即后台加载，切换时不再临时请求。 */}
      <View style={{ display: view === 'team' ? 'flex' : 'none', flex: 1, minHeight: 0, width: '100%' }}>
        <MessagesPage embedded onOpenPlanner={() => setView('ai')} />
      </View>
      <View style={{ display: view === 'ai' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
      <View style={{ margin: `${spacing.sm}px ${spacing.md}px 0`, padding: '14px', borderRadius: `${radius.md}px`, backgroundColor: '#EAF4EF', border: '1px solid #C9DED4' }}>
        <Text style={{ display: 'block', color: colors.textPrimary, fontSize: '15px', fontWeight: 800 }}>先了解需求，再匹配服务</Text>
        <Text style={{ display: 'block', color: colors.textSecondary, fontSize: '11px', lineHeight: '17px', marginTop: '4px' }}>仅从平台已上架产品中推荐服务；体检方案由健康顾问后续确认，复杂需求可转真人健康规划师。</Text>
      </View>
      <View style={{ margin: `${spacing.sm}px ${spacing.md}px 0`, padding: '9px 12px', borderRadius: `${radius.sm}px`, backgroundColor: '#FFF7E6', border: '1px solid #F5C26B' }}>
        <Text style={{ display: 'block', color: '#9A5B00', fontSize: '12px', fontWeight: 700 }}>本页面回复由人工智能（AI）生成</Text>
        <Text style={{ display: 'block', color: colors.textMuted, fontSize: '10px', marginTop: '2px' }}>内容仅用于健康管理需求梳理与服务规划，不替代专业人员意见</Text>
      </View>
      <ScrollView
        scrollY
        enableFlex
        scrollTop={plannerScrollTop}
        style={{ flex: 1, height: 0, minHeight: 0, padding: `${spacing.md}px`, boxSizing: 'border-box' }}
      >
        {messages.length === 1 && (
          <View style={{ marginBottom: `${spacing.md}px` }}>
            <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: '8px' }}>您想先做哪一步？</Text>
            <View style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {QUICK_PROMPTS.map((prompt) => (
                <View key={prompt} onClick={() => choosePrompt(prompt)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px', borderRadius: `${radius.sm}px`, backgroundColor: '#fff', border: `1px solid ${colors.border}` }}>
                  <Text style={{ fontSize: '13px', color: colors.primary, fontWeight: 700 }}>{prompt}</Text>
                  <Text style={{ fontSize: '16px', color: colors.primary }}>›</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        {messages.map((m, i) => (
          <View key={i} style={{
            display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '10px',
          }}>
            <View style={{
              maxWidth: '78%', padding: '10px 14px', borderRadius: `${radius.md}px`,
              backgroundColor: m.role === 'user' ? colors.primary : '#fff',
              border: m.role === 'user' ? 'none' : `1px solid ${colors.border}`,
            }}>
              {m.role === 'assistant' && <Text style={{ display: 'block', color: '#9A5B00', fontSize: '10px', fontWeight: 700, marginBottom: '4px' }}>AI健康规划师</Text>}
              {!!m.image && <Image src={mediaUrl(m.image)} mode="aspectFill" style={{ width: '190px', height: '140px', borderRadius: '8px', display: 'block', marginBottom: '6px' }} />}
              {!!m.audioUrl && <View onClick={() => playPlannerVoice(m.audioUrl)}><Text style={{ fontSize: '14px', color: m.role === 'user' ? '#fff' : colors.primary }}>▶ 语音 {Math.max(1, Math.round(m.audioDuration || 1))}″</Text></View>}
              {(!m.audioUrl || m.content !== '[语音消息]') && <Text style={{ fontSize: '14px', color: m.role === 'user' ? '#fff' : colors.textPrimary, lineHeight: '20px' }}>{m.content}</Text>}
              {!!m.audioTranscript && (
                <View>
                  <Text onClick={() => setVisiblePlannerTranscripts((current) => {
                    const next = new Set(current);
                    if (next.has(i)) next.delete(i); else next.add(i);
                    return next;
                  })} style={{ display: 'block', marginTop: '5px', fontSize: '11px', color: m.role === 'user' ? 'rgba(255,255,255,.82)' : colors.textMuted }}>
                    {visiblePlannerTranscripts.has(i) ? '收起文字' : '转文字'}
                  </Text>
                  {visiblePlannerTranscripts.has(i) && <Text style={{ display: 'block', marginTop: '6px', fontSize: '12px', color: m.role === 'user' ? '#fff' : colors.textSecondary }}>{m.audioTranscript}</Text>}
                </View>
              )}
            </View>
          </View>
        ))}
        {sending && <Text style={{ fontSize: '12px', color: colors.textMuted }}>正在梳理您的需求...</Text>}
        <View style={{ height: '1px' }} />
      </ScrollView>

      {!!plannerImage && <View style={{ padding: `6px ${spacing.md}px`, backgroundColor: '#fff' }}><Image src={plannerImage.path} mode="aspectFill" style={{ width: '52px', height: '52px', borderRadius: '8px' }} /><Text onClick={() => setPlannerImage(null)} style={{ color: colors.danger, marginLeft: '8px' }}>移除</Text></View>}
      <View style={{ padding: `7px ${spacing.sm}px`, backgroundColor: '#F7F7F7', borderTop: `1px solid ${colors.border}` }}>
        <View style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Text onClick={() => { setPlannerVoiceMode((value) => !value); setPlannerEmojiOpen(false); setPlannerMoreOpen(false); }} style={{ fontSize: '23px', lineHeight: '40px' }}>{plannerVoiceMode ? '⌨️' : '◉'}</Text>
          {plannerVoiceMode ? (
            <View onTouchStart={startPlannerRecording} onTouchEnd={stopPlannerRecording} onTouchCancel={stopPlannerRecording} style={{ flex: 1, height: '40px', borderRadius: '6px', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${colors.border}` }}><Text style={{ fontWeight: 700, color: recording ? colors.danger : colors.textPrimary }}>{recording ? '松开发送' : '按住说话'}</Text></View>
          ) : (
            <Input value={input} onInput={(e) => setInput(e.detail.value)} placeholder="输入消息" confirmType="send" onConfirm={() => send()} adjustPosition cursorSpacing={12} maxlength={500} style={{ flex: 1, height: '40px', minWidth: 0, boxSizing: 'border-box', backgroundColor: '#fff', borderRadius: '6px', padding: '0 10px', fontSize: '15px' }} />
          )}
          <Text onClick={() => { setPlannerEmojiOpen((value) => !value); setPlannerMoreOpen(false); setPlannerVoiceMode(false); }} style={{ fontSize: '23px' }}>☺</Text>
          {(input.trim() || plannerImage) ? <Text onClick={() => send()} style={{ padding: '7px 10px', borderRadius: '5px', backgroundColor: colors.primary, color: '#fff', fontWeight: 700 }}>发送</Text> : <Text onClick={() => { setPlannerMoreOpen((value) => !value); setPlannerEmojiOpen(false); }} style={{ fontSize: '26px' }}>⊕</Text>}
        </View>
        {plannerEmojiOpen && <View style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', padding: '12px 4px 4px' }}>{['😊', '👍', '🌙', '❤️', '谢谢', '收到'].map((emoji) => <Text key={emoji} onClick={() => setInput((value) => `${value}${emoji}`)} style={{ fontSize: '21px' }}>{emoji}</Text>)}</View>}
        {plannerMoreOpen && <View style={{ display: 'flex', padding: '12px 4px 4px' }}><View onClick={choosePlannerImage} style={{ textAlign: 'center' }}><View style={{ width: '48px', height: '48px', borderRadius: '9px', backgroundColor: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: '23px' }}>🖼️</Text></View><Text style={{ fontSize: '11px', color: colors.textMuted }}>图片</Text></View></View>}
      </View>
      {recording && <View style={{ position: 'fixed', left: '50%', top: '45%', transform: 'translate(-50%, -50%)', zIndex: 120, width: '170px', padding: '24px 16px', borderRadius: '16px', backgroundColor: 'rgba(20,34,29,.86)', textAlign: 'center' }}><Text style={{ display: 'block', color: '#fff', fontSize: '28px', marginBottom: '10px' }}>〽</Text><Text style={{ display: 'block', color: '#fff', fontSize: '16px', fontWeight: 700 }}>正在说话 {recordingSeconds}″</Text><Text style={{ display: 'block', color: 'rgba(255,255,255,.8)', fontSize: '12px', marginTop: '8px' }}>松开发送</Text></View>}
      </View>

      <View style={{ display: view === 'nutrition' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
        <View style={{ margin: `${spacing.sm}px ${spacing.md}px 0`, padding: '9px 12px', borderRadius: `${radius.sm}px`, backgroundColor: '#FFF7E6', border: '1px solid #F5C26B' }}>
          <Text style={{ display: 'block', color: '#9A5B00', fontSize: '12px', fontWeight: 700 }}>本页面分析与回复由人工智能（AI）生成</Text>
          <Text style={{ display: 'block', color: colors.textMuted, fontSize: '10px', marginTop: '2px' }}>照片识别、份量及热量为估算，不替代医生或注册营养师意见</Text>
        </View>
        <ScrollView scrollY style={{ flex: 1, padding: `${spacing.md}px` }} scrollIntoView="nutrition-bottom">
          {nutritionMessages.map((m, i) => (
            <View key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '10px' }}>
              <View style={{ maxWidth: '82%', padding: '10px 14px', borderRadius: `${radius.md}px`, backgroundColor: m.role === 'user' ? '#059669' : '#fff', border: m.role === 'user' ? 'none' : `1px solid ${colors.border}` }}>
                {!!m.image && <Image src={m.image} mode="aspectFill" style={{ width: '180px', height: '135px', borderRadius: '10px', marginBottom: '8px', display: 'block' }} />}
                {m.role === 'assistant' && <Text style={{ display: 'block', color: '#9A5B00', fontSize: '10px', fontWeight: 700, marginBottom: '4px' }}>AI生成</Text>}
                <Text style={{ fontSize: '14px', color: m.role === 'user' ? '#fff' : colors.textPrimary, lineHeight: '21px', whiteSpace: 'pre-wrap' }}>{m.content}</Text>
              </View>
            </View>
          ))}
          {sending && <Text style={{ fontSize: '12px', color: colors.textMuted }}>正在识别食物并估算营养...</Text>}
          <View id="nutrition-bottom" />
        </ScrollView>
        {!!foodImage && (
          <View style={{ padding: `8px ${spacing.md}px`, backgroundColor: '#fff', display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
            <Image src={foodImage.path} mode="aspectFill" style={{ width: '52px', height: '52px', borderRadius: '8px' }} />
            <Text style={{ flex: 1, fontSize: '12px', color: colors.textSecondary }}>饮食照片已选择</Text>
            <View onClick={() => setFoodImage(null)}><Text style={{ color: colors.danger, fontSize: '12px' }}>移除</Text></View>
          </View>
        )}
        <View style={{ padding: `${spacing.sm}px ${spacing.md}px`, backgroundColor: '#fff', borderTop: `1px solid ${colors.border}` }}>
          <View style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
            <View onClick={chooseFoodImage} style={{ padding: '8px 11px', borderRadius: `${radius.full}px`, backgroundColor: '#E8F5EF' }}><Text style={{ color: '#059669', fontSize: '12px', fontWeight: 600 }}>📷 饮食照片</Text></View>
            <View style={{ display: 'flex', flex: 1, alignItems: 'center', backgroundColor: colors.background, borderRadius: `${radius.full}px`, padding: '0 10px' }}>
              <Input type="digit" value={weightInput} onInput={(e) => setWeightInput(e.detail.value)} placeholder="本次体重（选填）" style={{ flex: 1, fontSize: '13px', height: '36px' }} />
              <Text style={{ fontSize: '12px', color: colors.textMuted }}>kg</Text>
            </View>
          </View>
          <View style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
            <Textarea value={nutritionInput} onInput={(e) => setNutritionInput(e.detail.value)} placeholder="描述食物、份量或您的目标..." autoHeight maxlength={500} style={{ flex: 1, minHeight: '44px', maxHeight: '100px', boxSizing: 'border-box', backgroundColor: colors.background, borderRadius: `${radius.md}px`, padding: '10px 12px', fontSize: '14px' }} />
            <View onClick={sendNutrition} style={{ padding: '10px 16px', borderRadius: `${radius.full}px`, backgroundColor: (nutritionInput.trim() || weightInput.trim() || foodImage) && !sending ? '#059669' : colors.border }}><Text style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>分析</Text></View>
          </View>
          <Text style={{ fontSize: '10px', color: colors.textMuted, display: 'block', marginTop: '6px' }}>照片识别与热量仅为估算，不替代医生或注册营养师意见</Text>
        </View>
      </View>
    </View>
  );
}
