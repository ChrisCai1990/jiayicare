import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow, typography } from '../../theme';
import { userAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const STEPS = [
  { id: 1, title: '基本信息', subtitle: '填写您的基础健康数据', icon: 'person-outline' },
  { id: 2, title: '病史与习惯', subtitle: '了解您的健康背景', icon: 'clipboard-outline' },
  { id: 3, title: '分配团队', subtitle: '为您匹配专属健康团队', icon: 'people-outline' },
  { id: 4, title: '健康评分', subtitle: '生成您的初始健康评分', icon: 'star-outline' },
];

const GENDER_OPTIONS = ['男', '女'];
const CHRONIC_OPTIONS = ['高血压', '糖尿病', '冠心病', '高脂血症', '慢性肾病', '无'];
const SMOKING_OPTIONS = ['从不', '偶尔', '每天'];
const DRINKING_OPTIONS = ['从不', '偶尔', '经常'];
const EXERCISE_OPTIONS = ['几乎不运动', '每周1-2次', '每周3-5次', '每天运动'];

function ProgressBar({ current, total }) {
  return (
    <View style={styles.progressWrap}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.progressDot,
            i < current && styles.progressDotDone,
            i === current - 1 && styles.progressDotActive,
          ]}
        />
      ))}
    </View>
  );
}

function Step1({ data, setData }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>填写您的基本信息</Text>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>姓名</Text>
        <View style={styles.inputBox}>
          <TextInput
            style={styles.input}
            placeholder="请输入您的姓名"
            value={data.name}
            onChangeText={v => setData(d => ({ ...d, name: v }))}
            placeholderTextColor={colors.textMuted}
          />
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>性别</Text>
        <View style={styles.tagRow}>
          {GENDER_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt}
              style={[styles.tag, data.gender === opt && styles.tagActive]}
              onPress={() => setData(d => ({ ...d, gender: opt }))}
            >
              <Text style={[styles.tagText, data.gender === opt && styles.tagTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>年龄</Text>
        <View style={styles.inputBox}>
          <TextInput
            style={styles.input}
            placeholder="请输入您的年龄（岁）"
            keyboardType="number-pad"
            value={data.age}
            onChangeText={v => setData(d => ({ ...d, age: v }))}
            placeholderTextColor={colors.textMuted}
          />
        </View>
      </View>

      <View style={styles.formGroup}>
        <View style={styles.inputRow}>
          <View style={[styles.inputBox, { flex: 1, marginRight: spacing.sm }]}>
            <Text style={styles.inputLabel}>身高（cm）</Text>
            <TextInput
              style={styles.input}
              placeholder="如：170"
              keyboardType="number-pad"
              value={data.height}
              onChangeText={v => setData(d => ({ ...d, height: v }))}
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={[styles.inputBox, { flex: 1 }]}>
            <Text style={styles.inputLabel}>体重（kg）</Text>
            <TextInput
              style={styles.input}
              placeholder="如：65"
              keyboardType="decimal-pad"
              value={data.weight}
              onChangeText={v => setData(d => ({ ...d, weight: v }))}
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>
      </View>

      <View style={[styles.formGroup, { marginBottom: spacing.xxl }]}>
        <Text style={styles.formLabel}>联系电话（可选）</Text>
        <View style={styles.inputBox}>
          <TextInput
            style={styles.input}
            placeholder="用于团队与您联系"
            keyboardType="phone-pad"
            value={data.contactPhone}
            onChangeText={v => setData(d => ({ ...d, contactPhone: v }))}
            placeholderTextColor={colors.textMuted}
          />
        </View>
      </View>
    </ScrollView>
  );
}

function Step2({ data, setData }) {
  const toggle = (field, value) => {
    const arr = data[field] || [];
    if (field === 'chronic') {
      if (value === '无') { setData(d => ({ ...d, chronic: ['无'] })); return; }
      const filtered = arr.filter(v => v !== '无');
      setData(d => ({
        ...d,
        chronic: filtered.includes(value) ? filtered.filter(v => v !== value) : [...filtered, value],
      }));
    } else {
      setData(d => ({ ...d, [field]: value }));
    }
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={styles.stepTitle}>您的健康背景</Text>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>既往病史（可多选）</Text>
        <View style={styles.tagGrid}>
          {CHRONIC_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt}
              style={[styles.tag, (data.chronic || []).includes(opt) && styles.tagActive]}
              onPress={() => toggle('chronic', opt)}
            >
              <Text style={[styles.tagText, (data.chronic || []).includes(opt) && styles.tagTextActive]}>
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>吸烟情况</Text>
        <View style={styles.tagRow}>
          {SMOKING_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt}
              style={[styles.tag, data.smoking === opt && styles.tagActive]}
              onPress={() => toggle('smoking', opt)}
            >
              <Text style={[styles.tagText, data.smoking === opt && styles.tagTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>饮酒情况</Text>
        <View style={styles.tagRow}>
          {DRINKING_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt}
              style={[styles.tag, data.drinking === opt && styles.tagActive]}
              onPress={() => toggle('drinking', opt)}
            >
              <Text style={[styles.tagText, data.drinking === opt && styles.tagTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.formGroup}>
        <Text style={styles.formLabel}>运动频率</Text>
        <View style={styles.tagGrid}>
          {EXERCISE_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt}
              style={[styles.tag, data.exercise === opt && styles.tagActive]}
              onPress={() => toggle('exercise', opt)}
            >
              <Text style={[styles.tagText, data.exercise === opt && styles.tagTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[styles.formGroup, { marginBottom: spacing.xxl }]}>
        <Text style={styles.formLabel}>家族病史（可选）</Text>
        <TextInput
          style={[styles.input, styles.textArea, styles.inputBox]}
          placeholder="如：父亲有高血压，母亲有糖尿病..."
          multiline
          numberOfLines={3}
          value={data.familyHistory}
          onChangeText={v => setData(d => ({ ...d, familyHistory: v }))}
          placeholderTextColor={colors.textMuted}
        />
      </View>
    </ScrollView>
  );
}

function Step3() {
  const slots = [
    { role: '家庭医生', title: '负责健康监测与诊疗建议', icon: 'medical', color: colors.primary },
    { role: '健管专员', title: '负责日常健康管理跟进', icon: 'person', color: colors.accent },
    { role: '营养师', title: '负责饮食方案与营养指导', icon: 'nutrition', color: colors.warning },
  ];

  return (
    <View>
      <Text style={styles.stepTitle}>为您匹配的专属团队</Text>
      <Text style={[typography.body2, { marginBottom: spacing.lg }]}>根据您的健康状况和服务套餐智能匹配，团队将在24小时内确认</Text>

      {slots.map((slot, i) => (
        <View key={i} style={styles.teamCard}>
          <View style={[styles.teamAvatar, { backgroundColor: slot.color + '15' }]}>
            <Ionicons name={slot.icon} size={24} color={slot.color} />
          </View>
          <View style={styles.teamInfo}>
            <Text style={styles.teamRole}>{slot.role}</Text>
            <Text style={styles.teamName}>待分配</Text>
            <Text style={styles.teamTitle}>{slot.title}</Text>
          </View>
          <View style={styles.teamCheck}>
            <Ionicons name="time-outline" size={22} color={colors.textMuted} />
          </View>
        </View>
      ))}

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
        <Text style={styles.infoText}>团队将在24小时内通过服务群与您联系，制定个性化健康管理方案。</Text>
      </View>
    </View>
  );
}

function Step4({ score }) {
  const level = score >= 80 ? { label: '健康', color: colors.success, icon: 'heart' }
    : score >= 60 ? { label: '需关注', color: colors.warning, icon: 'alert-circle' }
    : { label: '高风险', color: colors.danger, icon: 'warning' };

  return (
    <View style={styles.stepCenter}>
      <View style={[styles.scoreRing, { borderColor: level.color }]}>
        <Ionicons name={level.icon} size={28} color={level.color} />
        <Text style={[styles.scoreNum, { color: level.color }]}>{score}</Text>
        <Text style={styles.scoreLabel}>分</Text>
      </View>

      <Text style={[styles.scoreLevelText, { color: level.color }]}>健康等级：{level.label}</Text>
      <Text style={styles.scoreDesc}>基于您填写的健康初评问卷生成</Text>

      <View style={styles.infoBox}>
        <Ionicons name="sparkles-outline" size={16} color={colors.primary} />
        <Text style={styles.infoText}>您的健康团队将基于此评分制定个性化管理方案，并定期更新评分。</Text>
      </View>
    </View>
  );
}

export default function OnboardingScreen({ navigation }) {
  const { updateUser } = useAuth();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({});
  const [healthScore, setHealthScore] = useState(72);
  const [submitting, setSubmitting] = useState(false);

  const next = async () => {
    if (step < 4) {
      setStep(s => s + 1);
      // 第2步（病史与习惯）填完后提交到后端，拿到真实健康评分
      if (step === 2) {
        try {
          const res = await userAPI.onboarding({
            name: formData.name,
            age: formData.age ? parseInt(formData.age) : undefined,
            gender: formData.gender,
            height: formData.height ? parseFloat(formData.height) : undefined,
            weight: formData.weight ? parseFloat(formData.weight) : undefined,
            conditions: formData.chronic || [],
            smoking: formData.smoking,
            drinking: formData.drinking,
            exercise: formData.exercise,
            familyHistory: formData.familyHistory,
            medications: [],
          });
          if (res.success) {
            setHealthScore(res.data.healthScore || 72);
            updateUser({ healthScore: res.data.healthScore, name: formData.name });
          }
        } catch {}
      }
    } else {
      // 最后一步 → 进入主页
      setSubmitting(true);
      try {
        updateUser({ onboardingCompleted: true });
      } finally {
        setSubmitting(false);
        navigation.replace('Main');
      }
    }
  };

  const back = () => {
    if (step > 1) setStep(s => s - 1);
  };

  const isLastStep = step === 4;
  const btnLabel = isLastStep ? '进入我的健康管家 →' : '下一步';

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {step > 1 ? (
          <TouchableOpacity onPress={back} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
        ) : <View style={{ width: 36 }} />}
        <View style={styles.headerCenter}>
          <Text style={styles.headerStep}>{step} / {STEPS.length}</Text>
          <Text style={styles.headerTitle}>{STEPS[step - 1].title}</Text>
        </View>
        <TouchableOpacity onPress={() => { updateUser({ onboardingCompleted: true }); navigation.replace('Main'); }} style={styles.skipTopBtn}>
          <Text style={styles.skipTopText}>跳过</Text>
        </TouchableOpacity>
      </View>

      {/* Progress */}
      <ProgressBar current={step} total={STEPS.length} />

      {/* Step icon */}
      <View style={styles.stepIconWrap}>
        <View style={styles.stepIcon}>
          <Ionicons name={STEPS[step - 1].icon} size={28} color={colors.primary} />
        </View>
        <Text style={styles.stepSubtitle}>{STEPS[step - 1].subtitle}</Text>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {step === 1 && <Step1 data={formData} setData={setFormData} />}
        {step === 2 && <Step2 data={formData} setData={setFormData} />}
        {step === 3 && <Step3 />}
        {step === 4 && <Step4 score={healthScore} />}
      </View>

      {/* Bottom button */}
      <View style={styles.footer}>
        <TouchableOpacity style={[styles.nextBtn, isLastStep && styles.nextBtnFinal]} onPress={next} disabled={submitting}>
          {submitting
            ? <ActivityIndicator color={colors.white} />
            : <>
                <Text style={styles.nextBtnText}>{btnLabel}</Text>
                {!isLastStep && <Ionicons name="arrow-forward" size={18} color={colors.white} />}
              </>
          }
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { alignItems: 'center' },
  headerStep: { fontSize: 11, color: colors.textMuted, fontWeight: '600', letterSpacing: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: 2 },
  skipTopBtn: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  skipTopText: { fontSize: 13, color: colors.textMuted },
  progressWrap: { flexDirection: 'row', paddingHorizontal: spacing.lg, gap: spacing.xs, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.borderLight },
  progressDotDone: { backgroundColor: colors.primary },
  progressDotActive: { backgroundColor: colors.primary },
  stepIconWrap: { alignItems: 'center', paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  stepIcon: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: colors.primary10,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  stepSubtitle: { fontSize: 13, color: colors.textSecondary },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  stepTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  stepCenter: { flex: 1, alignItems: 'center' },
  formGroup: { marginBottom: spacing.lg },
  formLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm, letterSpacing: 0.3 },
  inputRow: { flexDirection: 'row' },
  inputBox: { backgroundColor: colors.surface, borderRadius: radius.sm, padding: spacing.sm, marginBottom: spacing.sm, borderWidth: 1.5, borderColor: colors.border },
  inputLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 4 },
  input: { fontSize: 15, color: colors.textPrimary },
  textArea: { height: 80, textAlignVertical: 'top' },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tagRow: { flexDirection: 'row', gap: spacing.sm },
  tag: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: radius.full, borderWidth: 1.5,
    borderColor: colors.border, backgroundColor: colors.surface,
  },
  tagActive: { borderColor: colors.primary, backgroundColor: colors.primary10 },
  tagText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  tagTextActive: { color: colors.primary, fontWeight: '600' },
  // Upload
  uploadArea: {
    width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg,
    borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primary + '60',
    alignItems: 'center', padding: spacing.xl, marginTop: spacing.md,
  },
  uploadTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginTop: spacing.sm },
  uploadDesc: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs, lineHeight: 20 },
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.primary, borderRadius: radius.full,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, marginTop: spacing.md,
  },
  uploadBtnText: { color: colors.white, fontWeight: '600', fontSize: 14 },
  uploadTips: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md },
  tipsTitle: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.sm },
  tipItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  tipText: { fontSize: 13, color: colors.textSecondary },
  skipBtn: { paddingVertical: spacing.md },
  skipBtnText: { fontSize: 13, color: colors.textMuted, textDecorationLine: 'underline' },
  // Team
  teamCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm, ...shadow.sm,
  },
  teamAvatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  teamInfo: { flex: 1 },
  teamRole: { fontSize: 11, color: colors.primary, fontWeight: '600', letterSpacing: 0.3 },
  teamName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  teamTitle: { fontSize: 12, color: colors.textSecondary },
  teamCheck: { paddingLeft: spacing.sm },
  // Score
  scoreRing: {
    width: 130, height: 130, borderRadius: 65, borderWidth: 8,
    alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg,
  },
  scoreNum: { fontSize: 36, fontWeight: '800', lineHeight: 40 },
  scoreLabel: { fontSize: 13, color: colors.textMuted },
  scoreLevelText: { fontSize: 18, fontWeight: '700', marginTop: spacing.md },
  scoreDesc: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  scoreDetails: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.lg },
  scoreItem: { marginBottom: spacing.sm },
  scoreItemHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  scoreItemLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  scoreItemVal: { fontSize: 13, fontWeight: '700' },
  scoreBar: { height: 6, backgroundColor: colors.borderLight, borderRadius: 3 },
  scoreBarFill: { height: 6, borderRadius: 3 },
  // Info box
  infoBox: {
    flexDirection: 'row', gap: spacing.xs, width: '100%',
    backgroundColor: colors.primary10, borderRadius: radius.sm,
    padding: spacing.sm, marginTop: spacing.md, alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 12, color: colors.primary, lineHeight: 18 },
  // Footer
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  nextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: radius.md, height: 52, gap: spacing.xs,
    ...shadow.md,
  },
  nextBtnFinal: { backgroundColor: colors.accent },
  nextBtnText: { color: colors.white, fontSize: 16, fontWeight: '700' },
});
