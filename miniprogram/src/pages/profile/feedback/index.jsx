import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Textarea, Picker, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius } from '../../../theme';
import { feedbackAPI } from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';

const TYPES = ['意见建议', '功能异常', '数据问题', '其他'];
const FAQ = [
  { q: '如何录入健康数据？', a: '在首页点击“记录健康数据”即可录入。' },
  { q: '我的数据存储在哪里？是否安全？', a: '您的健康数据存储在经过加密的云端服务器，采用身份验证和访问控制，仅您本人及获得授权的服务人员可以查看。' },
  { q: '如何联系健康顾问或健管专员？', a: '进入“消息”页面，选择已为您配置的健康顾问、营养师或健管专员即可发送消息。' },
  { q: '忘记手机号怎么办？', a: '请联系客服（19106761448）提供身份信息，由客服协助进行账号找回或迁移。' },
  { q: '服务期结束后数据是否保留？', a: '服务期结束后，您的历史健康数据仍会保留。' },
  { q: 'AI健康规划师的回答是否可以作为诊断依据？', a: '不能。AI健康规划师仅用于健康管理需求梳理与服务规划，不提供诊断、治疗或处方。' },
];

export default function HelpFeedbackPage() {
  const { statusBarHeight } = useNavBar();
  const [type, setType] = useState(TYPES[0]);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [openFaq, setOpenFaq] = useState(-1);
  const [myFeedback, setMyFeedback] = useState([]);
  const [loadingMine, setLoadingMine] = useState(true);

  const loadMine = useCallback(async () => {
    try {
      const res = await feedbackAPI.mine();
      if (res.success) setMyFeedback(res.data || []);
    } catch {} finally { setLoadingMine(false); }
  }, []);

  useEffect(() => { loadMine(); }, [loadMine]);

  const submit = async () => {
    if (!content.trim()) { Taro.showToast({ title: '请输入反馈内容', icon: 'none' }); return; }
    setSubmitting(true);
    try {
      const res = await feedbackAPI.submit(type, content.trim());
      if (res.success) {
        Taro.showToast({ title: '提交成功，感谢反馈', icon: 'success' });
        setContent('');
        loadMine();
      } else {
        Taro.showToast({ title: res.message || '提交失败', icon: 'none' });
      }
    } catch (err) {
      Taro.showToast({ title: err.message || '网络错误', icon: 'none' });
    } finally { setSubmitting(false); }
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`,
        backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`,
      }}>
        <View onClick={() => Taro.navigateBack()} style={{ padding: '4px' }}>
          <Icon name="chevron-left" size={20} color={colors.textPrimary} />
        </View>
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>帮助与反馈</Text>
        <View style={{ width: '28px' }} />
      </View>

      <View style={{ padding: `${spacing.lg}px` }}>
      <Text style={{ fontSize: '11px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', display: 'block', marginBottom: `${spacing.sm}px` }}>常见问题</Text>
      <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, overflow: 'hidden', marginBottom: `${spacing.lg}px` }}>
        {FAQ.map((item, i) => (
          <View key={item.q} onClick={() => setOpenFaq(openFaq === i ? -1 : i)} style={{ padding: '14px 16px', borderBottom: i < FAQ.length - 1 ? `1px solid ${colors.borderLight}` : 'none' }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <Text style={{ flex: 1, fontSize: '14px', fontWeight: 600, color: colors.textPrimary }}>{item.q}</Text>
              <Text style={{ fontSize: '15px', color: colors.textMuted }}>{openFaq === i ? '⌃' : '⌄'}</Text>
            </View>
            {openFaq === i && <Text style={{ fontSize: '13px', lineHeight: '20px', color: colors.textSecondary, display: 'block', marginTop: '8px' }}>{item.a}</Text>}
          </View>
        ))}
      </View>

      <Text style={{ fontSize: '11px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', display: 'block', marginBottom: `${spacing.sm}px` }}>意见反馈</Text>
      <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>反馈类型</Text>
      <Picker mode="selector" range={TYPES} value={TYPES.indexOf(type)} onChange={(e) => setType(TYPES[e.detail.value])}>
        <View style={{ border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', backgroundColor: '#fff', marginBottom: `${spacing.md}px` }}>
          <Text>{type}</Text>
        </View>
      </Picker>

      <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>反馈内容</Text>
      <Textarea
        style={{ width: '100%', border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px', minHeight: '120px', backgroundColor: '#fff' }}
        placeholder="请详细描述您遇到的问题或建议..."
        value={content}
        onInput={(e) => setContent(e.detail.value)}
      />

      <Button
        style={{ backgroundColor: colors.primary, color: '#fff', borderRadius: `${radius.md}px`, height: '48px', lineHeight: '48px', fontSize: '15px', fontWeight: 700, marginTop: `${spacing.lg}px` }}
        loading={submitting}
        onClick={submit}
      >
        提交反馈
      </Button>

      {(loadingMine || myFeedback.length > 0) && (
        <View style={{ marginTop: `${spacing.lg}px` }}>
          <Text style={{ fontSize: '11px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', display: 'block', marginBottom: `${spacing.sm}px` }}>我的反馈</Text>
          <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, overflow: 'hidden' }}>
            {loadingMine ? (
              <Text style={{ padding: '16px', fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
            ) : myFeedback.map((item, i) => (
              <View key={item._id || i} style={{ padding: '14px 16px', borderBottom: i < myFeedback.length - 1 ? `1px solid ${colors.borderLight}` : 'none' }}>
                <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: '12px', fontWeight: 700, color: colors.textPrimary }}>{item.type}</Text>
                  <Text style={{ fontSize: '11px', color: item.status === 'resolved' ? colors.success : colors.warning }}>{item.status === 'resolved' ? '已回复' : '待处理'}</Text>
                </View>
                <Text style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: '19px', display: 'block', marginTop: '6px' }}>{item.content}</Text>
                {item.reply ? <Text style={{ fontSize: '12px', color: colors.primary, lineHeight: '18px', display: 'block', marginTop: '8px', padding: '8px', backgroundColor: '#E8F5EF', borderRadius: `${radius.sm}px` }}>回复：{item.reply}</Text> : <Text style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginTop: '6px' }}>等待处理中，我们会尽快回复您</Text>}
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ marginTop: `${spacing.lg}px`, textAlign: 'center' }}>
        <Text style={{ fontSize: '12px', color: colors.textMuted }}>人工客服：19106761448（工作日 9:00-18:00）</Text>
      </View>
      </View>
    </View>
  );
}
