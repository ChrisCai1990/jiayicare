import React, { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../theme';

// ── 服务方案数据 ─────────────────────────────────────────────────
const PLANS = [
  {
    key: 'annual_screen',
    title: '年度筛查方案',
    icon: 'calendar-outline',
    color: '#0077B6',
    bg: '#E3F2FB',
    desc: '全面的年度健康筛查，涵盖基础体检、专项检查及报告解读，帮助您及早发现健康风险。',
    items: [
      '年度综合体检套餐',
      '肿瘤标志物检测',
      '心脑血管专项评估',
      'AI 体检报告解读',
      '健康管理师报告讲解',
      '年度健康风险评分',
    ],
  },
  {
    key: 'annual_mgmt',
    title: '年度健康管理方案',
    icon: 'shield-checkmark-outline',
    color: '#1E6B50',
    bg: '#E8F5EF',
    desc: '全年持续跟踪管理，定期随访、动态监测与专属健康顾问服务，全程守护您的健康。',
    items: [
      '季度健康随访（4次/年）',
      '月度健康数据分析报告',
      '专属家庭医生一对一',
      '慢病管理与用药跟踪',
      '24h健康咨询响应',
      '年度健康管理计划制定',
    ],
  },
  {
    key: 'nutrition',
    title: '强化营养干预方案',
    icon: 'nutrition-outline',
    color: '#D97706',
    bg: '#FEF3E2',
    desc: '由专业营养师制定个性化饮食方案，结合身体指标动态调整，改善营养状态与慢性症状。',
    items: [
      '营养素全面评估',
      '个性化饮食处方',
      '营养师每周跟进指导',
      '营养补充剂方案推荐',
      '月度身体成分分析',
      '饮食记录与AI反馈',
    ],
  },
  {
    key: 'medical_assist',
    title: '就医协助服务方案',
    icon: 'people-outline',
    color: '#7C3AED',
    bg: '#F2EEFF',
    desc: '专业就医陪诊与协调服务，帮助您挂号预约、解读诊疗意见、协助多学科会诊沟通。',
    items: [
      '三甲医院优先预约挂号',
      '就医全程陪诊服务',
      '诊断报告专业解读',
      '多学科会诊协调',
      '就医前病史整理归档',
      '出院后康复跟进指导',
    ],
  },
];

function PlanCard({ plan, expanded, onToggle }) {
  return (
    <View style={styles.planCard}>
      {/* 标题栏 */}
      <TouchableOpacity style={styles.planHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={[styles.planIconWrap, { backgroundColor: plan.bg }]}>
          <Ionicons name={plan.icon} size={22} color={plan.color} />
        </View>
        <View style={styles.planTitleWrap}>
          <Text style={styles.planTitle}>{plan.title}</Text>
          <Text style={styles.planDescShort} numberOfLines={expanded ? 0 : 1}>{plan.desc}</Text>
        </View>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
        />
      </TouchableOpacity>

      {/* 展开内容 */}
      {expanded && (
        <View style={styles.planBody}>
          {plan.items.map((item, i) => (
            <View key={i} style={styles.planItem}>
              <Ionicons name="checkmark-circle" size={15} color={plan.color} />
              <Text style={styles.planItemText}>{item}</Text>
            </View>
          ))}
          <TouchableOpacity
            style={[styles.consultBtn, { borderColor: plan.color + '60' }]}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={14} color={plan.color} />
            <Text style={[styles.consultBtnText, { color: plan.color }]}>咨询健康管理师</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function ServicePlansScreen({ navigation }) {
  const [expanded, setExpanded] = useState(null);

  const toggle = (key) => setExpanded(prev => prev === key ? null : key);

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶栏 */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>服务方案</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* 说明 */}
        <View style={styles.introCard}>
          <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
          <Text style={styles.introText}>
            以下方案由嘉医管家专业团队提供，您可根据自身需求选择合适的健康管理服务。点击方案查看详情，如需开通请联系健康管理师。
          </Text>
        </View>

        {/* 方案列表 */}
        {PLANS.map(plan => (
          <PlanCard
            key={plan.key}
            plan={plan}
            expanded={expanded === plan.key}
            onToggle={() => toggle(plan.key)}
          />
        ))}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.background,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },

  content: { padding: spacing.lg, gap: spacing.md },

  introCard: {
    flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start',
    backgroundColor: colors.primary + '10',
    borderRadius: radius.sm, padding: spacing.md,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  introText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },

  planCard: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  planHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md,
  },
  planIconWrap: {
    width: 44, height: 44, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  planTitleWrap: { flex: 1 },
  planTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 3 },
  planDescShort: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  planBody: {
    borderTopWidth: 1, borderTopColor: colors.borderLight,
    padding: spacing.md, gap: spacing.xs,
  },
  planItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 4 },
  planItemText: { flex: 1, fontSize: 13, color: colors.textSecondary },

  consultBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: spacing.sm, paddingVertical: 10,
    borderRadius: radius.md, borderWidth: 1.5,
  },
  consultBtnText: { fontSize: 13, fontWeight: '600' },
});
