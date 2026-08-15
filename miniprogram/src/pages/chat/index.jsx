import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Textarea, ScrollView, Input, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius } from '../../theme';
import { chatAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import useNavBar from '../../hooks/useNavBar';
import Icon from '../../components/Icon';
import MessagesPage from '../messages/index';

const DEFAULT_CONFIG = {
  plannerName: '小嘉 | 健康规划师', teamName: '健康服务团队', aiOnlineLabel: 'AI在线',
  plannerCardTitle: '把复查这件事办妥', plannerCardSubtitle: '承接复查提醒，结合日常健康记录梳理流程，并按需对接陪诊、代办等服务。',
  greeting: '您好，我是小嘉。您可以把已有的复查提醒或这次要办理的事项告诉我，我会先了解情况，再帮您整理下一步。',
  quickPrompts: ['帮我安排已有的复查提醒', '看看我的血压或体重趋势', '我需要陪诊或代办服务'],
  disclaimer: '内容用于健康管理和复查事项整理，不替代医生诊断和建议。',
};

// 小嘉健康规划师：仅梳理健康管理需求与规划平台服务，不提供医疗咨询。
export default function ChatPage() {
  const { statusBarHeight } = useNavBar();
  const { user } = useAuth();
  const [assistantConfig, setAssistantConfig] = useState(DEFAULT_CONFIG);
  const [onlineStatus, setOnlineStatus] = useState({ mode: 'ai', label: DEFAULT_CONFIG.aiOnlineLabel });
  const [messages, setMessages] = useState([{ role: 'assistant', content: DEFAULT_CONFIG.greeting }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [view, setView] = useState('team');
  const [nutritionMessages, setNutritionMessages] = useState([
    { role: 'assistant', content: '您好，我是AI营养师。您可以描述今天吃了什么、记录体重，或拍一张饮食照片，我会立即做初步分析。' },
  ]);
  const [nutritionInput, setNutritionInput] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [foodImage, setFoodImage] = useState(null);
  const [plannerScrollTop, setPlannerScrollTop] = useState(0);
  const historyUserRef = useRef('');
  const scrollRef = useRef();

  useEffect(() => {
    let active = true;
    chatAPI.getConfig().then(res => {
      if (!active || !res?.data) return;
      const next = { ...DEFAULT_CONFIG, ...res.data };
      setAssistantConfig(next);
      if (!historyUserRef.current) setMessages([{ role: 'assistant', content: next.greeting }]);
    }).catch(() => {});
    const refreshStatus = () => chatAPI.getStatus().then(res => { if (active && res?.data) setOnlineStatus(res.data); }).catch(() => {});
    refreshStatus();
    const timer = setInterval(refreshStatus, 15000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  // 与 App 端保持一致：进入规划师时从后端恢复最近 50 轮对话。
  // 对话记录按登录用户查询，既能跨页面/重启保留，也不会在切换账号时串话。
  useEffect(() => {
    if (!user?._id || historyUserRef.current === user._id) return;
    const historyUserId = user._id;
    historyUserRef.current = historyUserId;
    const greeting = { role: 'assistant', content: assistantConfig.greeting };
    setMessages([greeting]);
    chatAPI.getLogs(historyUserId).then((res) => {
      if (historyUserRef.current !== historyUserId) return;
      if (!res?.success || !Array.isArray(res.data) || res.data.length === 0) return;
      const historyMessages = [...res.data].reverse().flatMap((log) => [
        log.userMessage ? { role: 'user', content: log.userMessage } : null,
        log.aiReply ? { role: 'assistant', content: log.aiReply } : null,
      ].filter(Boolean));
      setMessages([greeting, ...historyMessages]);
    }).catch(() => {});
  }, [user?._id, assistantConfig.greeting]);

  useDidShow(() => {
    const requestedView = Taro.getStorageSync('healthHubView');
    if (requestedView === 'team') setView('team');
    Taro.removeStorageSync('healthHubView');
  });

  useEffect(() => {
    if (view !== 'ai') return;
    const timer = setTimeout(() => setPlannerScrollTop((value) => value + 100000), 100);
    return () => clearTimeout(timer);
  }, [view, messages.length, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);
    try {
      const res = await chatAPI.send(next, { name: user?.name });
      const reply = res?.data?.content || res?.content || '抱歉，我暂时无法回复，请稍后重试。';
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: `请求失败：${err.message || '网络异常'}` }]);
    } finally {
      setSending(false);
    }
  };

  const choosePrompt = (text) => {
    setInput(text);
  };

  const chooseFoodImage = async () => {
    try {
      const result = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const path = result.tempFilePaths?.[0];
      if (!path) return;
      const base64 = Taro.getFileSystemManager().readFileSync(path, 'base64');
      const ext = (path.split('.').pop() || 'jpg').toLowerCase();
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      setFoodImage({ path, mimeType, data: `data:${mimeType};base64,${base64}` });
    } catch (err) {
      if (!/cancel/i.test(err?.errMsg || '')) Taro.showToast({ title: '无法读取图片，请重试', icon: 'none' });
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
          <View style={{ flex: 1 }}><Text style={{ display: 'block', fontSize: '20px', fontWeight: 800, color: colors.textPrimary }}>{view === 'ai' ? assistantConfig.plannerName : '健康管家'}</Text>{view === 'ai' && <Text style={{ display: 'block', fontSize: '11px', color: onlineStatus.mode === 'human' ? '#D97706' : '#059669', marginTop: '2px' }}>● {onlineStatus.label}</Text>}</View>
        </View>
      </View>

      {/* 两个区域同时挂载：团队消息进入页面即后台加载，切换时不再临时请求。 */}
      <View style={{ display: view === 'team' ? 'flex' : 'none', flex: 1, minHeight: 0, width: '100%' }}>
        <MessagesPage embedded assistantConfig={assistantConfig} onlineStatus={onlineStatus} onOpenPlanner={() => setView('ai')} />
      </View>
      <View style={{ display: view === 'ai' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column' }}>
      <View style={{ margin: `${spacing.sm}px ${spacing.md}px 0`, padding: '9px 12px', borderRadius: `${radius.sm}px`, backgroundColor: '#FFF7E6', border: '1px solid #F5C26B' }}>
        <Text style={{ display: 'block', color: '#9A5B00', fontSize: '12px', fontWeight: 700 }}>本页面回复由人工智能（AI）生成</Text>
        <Text style={{ display: 'block', color: colors.textMuted, fontSize: '10px', marginTop: '2px' }}>{assistantConfig.disclaimer}</Text>
      </View>
      <ScrollView scrollX style={{ flexShrink: 0, width: '100%', whiteSpace: 'nowrap', padding: `${spacing.sm}px ${spacing.md}px 0`, boxSizing: 'border-box' }}>
        {(assistantConfig.quickPrompts || []).map((prompt) => (
          <View key={prompt} onClick={() => choosePrompt(prompt)} style={{ display: 'inline-block', padding: '7px 11px', marginRight: '7px', borderRadius: `${radius.full}px`, backgroundColor: '#fff', border: `1px solid ${colors.border}` }}>
            <Text style={{ fontSize: '11px', color: colors.primary, fontWeight: 700 }}>{prompt}</Text>
          </View>
        ))}
      </ScrollView>
      <ScrollView scrollY scrollTop={plannerScrollTop} scrollWithAnimation style={{ flex: 1, padding: `${spacing.md}px`, boxSizing: 'border-box' }}>
        {messages.map((m, i) => (
          <View key={i} style={{
            display: 'flex', width: '100%', minWidth: 0, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '10px', boxSizing: 'border-box',
          }}>
            <View style={{
              maxWidth: '78%', minWidth: 0, padding: '10px 14px', borderRadius: `${radius.md}px`, boxSizing: 'border-box', overflow: 'hidden',
              backgroundColor: m.role === 'user' ? colors.primary : '#fff',
              border: m.role === 'user' ? 'none' : `1px solid ${colors.border}`,
            }}>
              {m.role === 'assistant' && <Text style={{ display: 'block', color: '#9A5B00', fontSize: '10px', fontWeight: 700, marginBottom: '4px' }}>{onlineStatus.mode === 'human' ? onlineStatus.label : assistantConfig.plannerName}</Text>}
              <Text style={{ display: 'block', width: '100%', fontSize: '14px', color: m.role === 'user' ? '#fff' : colors.textPrimary, lineHeight: '20px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', overflowWrap: 'anywhere' }}>{m.content}</Text>
            </View>
          </View>
        ))}
        {sending && <Text style={{ fontSize: '12px', color: colors.textMuted }}>正在梳理您的需求...</Text>}
        <View id={`planner-bottom-${messages.length}`} />
      </ScrollView>

      <View style={{
        display: 'flex', alignItems: 'flex-end', gap: '8px', padding: `${spacing.sm}px ${spacing.md}px`,
        backgroundColor: '#fff', borderTop: `1px solid ${colors.border}`,
      }}>
        <Textarea
          style={{ flex: 1, minHeight: '48px', maxHeight: '112px', boxSizing: 'border-box', backgroundColor: colors.background, borderRadius: `${radius.md}px`, padding: '12px 14px', fontSize: '15px', lineHeight: '22px' }}
          placeholder="描述您想了解的服务..."
          value={input}
          onInput={(e) => setInput(e.detail.value)}
          autoHeight
          maxlength={500}
          confirmType="send"
          onConfirm={send}
        />
        <View
          onClick={send}
          style={{
            padding: '10px 18px', borderRadius: `${radius.full}px`,
            backgroundColor: input.trim() ? colors.primary : colors.border,
          }}
        >
          <Text style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>发送</Text>
        </View>
      </View>
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
