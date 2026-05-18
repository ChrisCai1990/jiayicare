import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { feedbackAPI } from '../../services/api';

const FAQ = [
  {
    q: '如何录入健康数据？',
    a: '在首页点击"记录数据"，或进入"健康档案"页面点击右上角"录入"按钮，选择对应类型（血压/血糖/心率/体重）即可录入。',
  },
  {
    q: '我的数据存储在哪里？是否安全？',
    a: '您的健康数据存储在经过加密的云端服务器，采用 JWT 身份验证，仅您本人及授权的医生可以查看。我们不会将您的数据用于任何商业目的。',
  },
  {
    q: '如何联系我的健管师或医生？',
    a: '进入"消息"页面，可以查看来自医生和健管师的消息。如需主动联系，请拨打服务包中提供的专属联系电话，或等待下次随访安排。',
  },
  {
    q: '忘记手机号怎么办？',
    a: '请联系客服（400-xxx-xxxx）提供身份信息，由客服协助进行账号找回或迁移。',
  },
  {
    q: '服务包到期后数据是否保留？',
    a: '服务包到期后，您的健康数据仍会保留在系统中，不会被删除。您可以继续查看历史数据，但无法享受新增服务。续约后立即恢复全部功能。',
  },
  {
    q: 'AI 健康助手的回答是否可以作为诊断依据？',
    a: 'AI 助手的回答仅供参考，不构成医疗诊断或建议。如有健康问题，请以医生的专业诊断为准，必要时及时就医。',
  },
];

const FEEDBACK_TYPES = ['意见建议', '功能异常', '数据问题', '其他'];

function FaqItem({ item }) {
  const [open, setOpen] = useState(false);
  return (
    <TouchableOpacity
      style={styles.faqItem}
      onPress={() => setOpen(v => !v)}
      activeOpacity={0.8}
    >
      <View style={styles.faqQ}>
        <Text style={styles.faqQText}>{item.q}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
      </View>
      {open && <Text style={styles.faqAText}>{item.a}</Text>}
    </TouchableOpacity>
  );
}

export default function HelpFeedbackScreen({ navigation }) {
  const [type, setType]       = useState('意见建议');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast]     = useState('');

  const showToast = (msg) => {
    setToast(msg); setTimeout(() => setToast(''), 3000);
  };

  const submit = async () => {
    if (!content.trim()) { showToast('请描述您的问题或建议'); return; }
    setSubmitting(true);
    try {
      const res = await feedbackAPI.submit(type, content.trim());
      if (res.success) {
        setContent('');
        showToast(res.message || '提交成功，感谢您的反馈！');
      } else {
        showToast(res.message || '提交失败，请稍后重试');
      }
    } catch (e) {
      showToast(e.message || '网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>帮助与反馈</Text>
        <View style={{ width: 36 }} />
      </View>

      {!!toast && (
        <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View>
      )}

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* FAQ */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>常见问题</Text>
          <View style={styles.faqCard}>
            {FAQ.map((item, i) => (
              <View key={i}>
                <FaqItem item={item} />
                {i < FAQ.length - 1 && <View style={styles.faqDivider} />}
              </View>
            ))}
          </View>
        </View>

        {/* Feedback form */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>意见反馈</Text>
          <View style={styles.formCard}>
            {/* Type */}
            <Text style={styles.formLabel}>反馈类型</Text>
            <View style={styles.typeRow}>
              {FEEDBACK_TYPES.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeChip, type === t && styles.typeChipActive]}
                  onPress={() => setType(t)}
                >
                  <Text style={[styles.typeChipText, type === t && styles.typeChipTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Content */}
            <Text style={[styles.formLabel, { marginTop: spacing.md }]}>描述详情</Text>
            <TextInput
              style={styles.textArea}
              placeholder="请详细描述您的问题或建议，有助于我们快速处理……"
              placeholderTextColor={colors.textMuted}
              value={content}
              onChangeText={setContent}
              multiline
              numberOfLines={5}
              maxLength={500}
              textAlignVertical="top"
            />
            <Text style={styles.charCount}>{content.length}/500</Text>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={submit}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color={colors.white} />
                : <Text style={styles.submitBtnText}>提交反馈</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* Contact */}
        <View style={styles.contactWrap}>
          <Ionicons name="headset-outline" size={16} color={colors.textMuted} />
          <Text style={styles.contactText}>人工客服：400-888-8888（工作日 9:00-18:00）</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  toast: {
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    backgroundColor: colors.textPrimary, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  toastText: { color: colors.white, fontSize: 13, textAlign: 'center' },
  section: { marginHorizontal: spacing.lg, marginTop: spacing.lg },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: spacing.sm },
  faqCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  faqItem: { paddingHorizontal: spacing.md, paddingVertical: 14 },
  faqQ: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  faqQText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.textPrimary, lineHeight: 20 },
  faqAText: { fontSize: 13, color: colors.textSecondary, lineHeight: 20, marginTop: spacing.sm },
  faqDivider: { height: 1, backgroundColor: colors.borderLight, marginHorizontal: spacing.md },
  formCard: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md,
  },
  formLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  typeChip: {
    paddingHorizontal: spacing.sm, paddingVertical: 7,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
  },
  typeChipActive: { borderColor: colors.primary, backgroundColor: colors.primary + '10' },
  typeChipText: { fontSize: 12, color: colors.textSecondary },
  typeChipTextActive: { color: colors.primary, fontWeight: '700' },
  textArea: {
    backgroundColor: colors.background, borderRadius: radius.sm,
    borderWidth: 1.5, borderColor: colors.border,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm,
    fontSize: 14, color: colors.textPrimary, minHeight: 120,
  },
  charCount: { fontSize: 11, color: colors.textMuted, textAlign: 'right', marginTop: 4, marginBottom: spacing.md },
  submitBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 13, alignItems: 'center',
  },
  submitBtnText: { fontSize: 15, color: colors.white, fontWeight: '700' },
  contactWrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: spacing.lg,
  },
  contactText: { fontSize: 12, color: colors.textMuted },
});
