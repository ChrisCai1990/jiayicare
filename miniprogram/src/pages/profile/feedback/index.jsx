import React, { useState } from 'react';
import { View, Text, Textarea, Picker, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius } from '../../../theme';
import { feedbackAPI } from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';

const TYPES = ['功能建议', '问题反馈', '内容纠错', '其他'];

// 简化实现：意见反馈表单，完整版含历史反馈列表见 app/src/screens/profile/HelpFeedbackScreen.js
export default function HelpFeedbackPage() {
  const { statusBarHeight } = useNavBar();
  const [type, setType] = useState(TYPES[0]);
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!content.trim()) { Taro.showToast({ title: '请输入反馈内容', icon: 'none' }); return; }
    setSubmitting(true);
    try {
      const res = await feedbackAPI.submit(type, content.trim());
      if (res.success) {
        Taro.showToast({ title: '提交成功，感谢反馈', icon: 'success' });
        setContent('');
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

      <View style={{ marginTop: `${spacing.lg}px`, textAlign: 'center' }}>
        <Text style={{ fontSize: '12px', color: colors.textMuted }}>客服电话：17742039618</Text>
      </View>
      </View>
    </View>
  );
}
