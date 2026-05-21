import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator,
  Modal, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { reportsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { mockMedicalReports } from '../../data/mockData';

// ── 重新设计的8类报告 ─────────────────────────────────────────────
const TYPE_LIST = [
  { key: 'annual',       label: '年度体检',   icon: 'clipboard-outline',      color: '#0077B6', bg: '#EBF5FB' },
  { key: 'body_comp',    label: '人体成分',   icon: 'body-outline',           color: '#1E6B50', bg: '#E8F5EF' },
  { key: 'blood',        label: '血液检查',   icon: 'water-outline',          color: '#DC3545', bg: '#FDEEEC' },
  { key: 'ultrasound',   label: '超声检查',   icon: 'scan-outline',           color: '#7C3AED', bg: '#F2EEFF' },
  { key: 'radiology',    label: '放射检查',   icon: 'radio-outline',          color: '#D97706', bg: '#FEF3E2' },
  { key: 'mri',          label: '磁共振',     icon: 'cellular-outline',       color: '#0369A1', bg: '#E0F2FE' },
  { key: 'endoscopy',    label: '内镜检查',   icon: 'search-outline',         color: '#059669', bg: '#D1FAE5' },
  { key: 'ecg',          label: '心电图',     icon: 'pulse-outline',          color: '#9D174D', bg: '#FCE7F3' },
  { key: 'pathology',    label: '病理报告',   icon: 'flask-outline',          color: '#B45309', bg: '#FEF3C7' },
  { key: 'other',        label: '其他',       icon: 'document-outline',       color: '#64748B', bg: '#F1F5F9' },
];

const TYPE_META = Object.fromEntries(
  TYPE_LIST.map(t => [t.key, t])
);

const STATUS_META = {
  analyzed: { label: '已解读', color: colors.success, icon: 'checkmark-circle' },
  normal:   { label: '正常',   color: colors.success, icon: 'checkmark-circle' },
  pending:  { label: '待解读', color: colors.warning, icon: 'time'             },
  abnormal: { label: '异常',   color: colors.danger,  icon: 'alert-circle'     },
};

// ── 主样式（必须在所有组件函数之前定义，防止 Railway 生产构建 TDZ）──
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { padding: 4 },
  pageTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },

  // Page tabs
  pageTabs: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pageTab: {
    flex: 1, paddingVertical: 11, alignItems: 'center',
    borderBottomWidth: 2.5, borderBottomColor: 'transparent',
  },
  pageTabActive: { borderBottomColor: colors.primary },
  pageTabText: { fontSize: 14, color: colors.textMuted, fontWeight: '600' },
  pageTabTextActive: { color: colors.primary },

  // 动态监测卡片
  monitorCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.white, borderRadius: radius.md,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
    ...shadow.sm,
  },
  monitorIconWrap: {
    width: 52, height: 52, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  monitorSectionTitle: { fontSize: 13, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: spacing.xs },
  monitorLabel: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  monitorSubtitle: { fontSize: 12, color: colors.textSecondary, marginBottom: 4 },
  monitorComingSoon: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  monitorComingSoonText: { fontSize: 11, color: colors.textMuted },
  monitorBadge: {
    backgroundColor: colors.border, borderRadius: radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  monitorBadgeText: { fontSize: 10, color: colors.textMuted, fontWeight: '600' },
  uploadZone: {
    backgroundColor: colors.white, borderRadius: radius.xl,
    borderWidth: 2, borderColor: colors.primary + '30', borderStyle: 'dashed',
    padding: spacing.xl, alignItems: 'center', ...shadow.sm,
  },
  uploadIconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  uploadTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, marginBottom: 4 },
  uploadDesc: { fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18, marginBottom: spacing.md },
  uploadBtnRow: { flexDirection: 'row', gap: spacing.sm },
  uploadOptionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.primary + '40',
    backgroundColor: colors.primary + '08',
  },
  uploadOptionText: { fontSize: 12, color: colors.primary, fontWeight: '600' },
  aiCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.primary + '08', borderWidth: 1.5, borderColor: colors.primary + '25',
    borderRadius: radius.lg, padding: spacing.md,
  },
  aiLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  aiIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  aiTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  aiDesc: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  statsRow: { flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
  statCard: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center', gap: 3, ...shadow.sm },
  statVal: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, color: colors.textMuted },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: spacing.sm },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.white,
  },
  filterChipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  filterChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  filterChipTextActive: { color: colors.white, fontWeight: '700' },
  loadingWrap: { paddingVertical: spacing.xl, alignItems: 'center' },
  emptyWrap: { paddingVertical: spacing.xl * 2, alignItems: 'center', gap: spacing.sm },
  emptyText: { fontSize: 14, color: colors.textMuted },
  reportsList: { gap: spacing.sm },
  reportCard: {
    flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.md, alignItems: 'flex-start', ...shadow.sm,
  },
  reportIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, position: 'relative', flexShrink: 0 },
  reportStatusDot: { position: 'absolute', bottom: 2, right: 2, width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: colors.white },
  reportBody: { flex: 1 },
  reportTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 3, flexWrap: 'wrap' },
  reportTitle: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  typeBadgeText: { fontSize: 10, fontWeight: '600' },
  reportHospital: { fontSize: 12, color: colors.textSecondary },
  reportDate: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  findingsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: spacing.xs },
  findingChip: { backgroundColor: colors.warning + '12', paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  findingText: { fontSize: 10, color: colors.warning, fontWeight: '500' },
  reportRight: { alignItems: 'flex-end', marginLeft: spacing.xs, gap: spacing.xs },
  reportRightTop: { alignItems: 'flex-end', gap: 4 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.full },
  statusText: { fontSize: 11, fontWeight: '600' },
  auditedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#E3F2FB', borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 2 },
  auditedBadgeText: { fontSize: 10, fontWeight: '600', color: '#0077B6' },
  deleteBtn: { padding: 4 },
  deleteBtnDisabled: { opacity: 0.4 },

  toast: {
    position: 'absolute', bottom: 40, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(34,160,107,0.92)',
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: radius.full,
  },
  toastError: { backgroundColor: 'rgba(220,53,69,0.92)' },
  toastText: { fontSize: 14, color: colors.white, fontWeight: '500' },

  // 上传配置 Modal
  configCard: {
    backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, paddingTop: spacing.lg,
  },
  configTitle: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, marginBottom: 6 },
  configFile: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.md, backgroundColor: colors.borderLight, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.sm },
  configField: { marginBottom: spacing.sm },
  configFieldLabel: { fontSize: 12, fontWeight: '600', color: colors.textMuted, marginBottom: 5, letterSpacing: 0.3 },
  configInput: {
    borderWidth: 1.5, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 10,
    fontSize: 14, color: colors.textPrimary,
  },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  typeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.background,
  },
  typeChipText: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  configActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  configCancelBtn: {
    flex: 1, paddingVertical: 13, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  configCancelText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  configConfirmBtn: {
    flex: 2, paddingVertical: 13, borderRadius: radius.md,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  configConfirmText: { fontSize: 14, color: colors.white, fontWeight: '700' },

  // 报告预览 Modal
  previewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  previewCard: {
    backgroundColor: colors.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.xl,
    maxHeight: '88%',
  },
  previewTopBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  previewTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, marginRight: spacing.sm },
  previewTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary, flex: 1 },
  previewBody: { flex: 1, marginVertical: spacing.md },
  previewImage: { width: '100%', height: 480 },
  previewPdfWrap: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md },
  previewPdfText: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },
  previewOpenBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, paddingHorizontal: spacing.lg, paddingVertical: 10,
    borderRadius: radius.full,
  },
  previewOpenBtnText: { fontSize: 13, color: colors.white, fontWeight: '700' },
  previewNoContent: { alignItems: 'center', paddingVertical: 60, gap: spacing.sm },
  previewNoContentTitle: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  previewNoContentDesc: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  previewCloseBtn: {
    backgroundColor: colors.primary, borderRadius: radius.md,
    paddingVertical: 14, alignItems: 'center', marginTop: spacing.sm,
  },
  previewCloseBtnText: { fontSize: 15, color: colors.white, fontWeight: '700' },
});

// 简单 Toast
function Toast({ msg, isError }) {
  if (!msg) return null;
  return (
    <View style={[styles.toast, isError && styles.toastError]}>
      <Ionicons name={isError ? 'alert-circle' : 'checkmark-circle'} size={16} color={colors.white} />
      <Text style={styles.toastText}>{msg}</Text>
    </View>
  );
}

function UploadZone({ onPress, uploading }) {
  return (
    <TouchableOpacity style={styles.uploadZone} onPress={onPress} activeOpacity={0.8} disabled={uploading}>
      <View style={styles.uploadIconWrap}>
        {uploading
          ? <ActivityIndicator color={colors.primary} size="large" />
          : <Ionicons name="cloud-upload-outline" size={32} color={colors.primary} />
        }
      </View>
      <Text style={styles.uploadTitle}>{uploading ? '上传中…' : '上传体检报告'}</Text>
      <Text style={styles.uploadDesc}>支持 PDF、JPG、PNG 格式{'\n'}单文件最大 20MB</Text>
      {!uploading && (
        <View style={styles.uploadBtnRow}>
          <TouchableOpacity style={styles.uploadOptionBtn} onPress={onPress}>
            <Ionicons name="document-outline" size={16} color={colors.primary} />
            <Text style={styles.uploadOptionText}>选择文件</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── 报告预览 Modal ────────────────────────────────────────────────
function ReportPreviewModal({ report, onClose }) {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [mimeType, setMimeType] = useState('');

  useEffect(() => {
    if (!report) return;
    setLoading(true);
    reportsAPI.get(report._id || report.id)
      .then(res => {
        if (res.success) {
          setContent(res.data.content || '');
          setMimeType(res.data.mimeType || '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [report]);

  if (!report) return null;
  const tm = TYPE_META[report.type] || TYPE_META.annual;
  const isImage = mimeType.startsWith('image/');
  const isPdf   = mimeType === 'application/pdf';
  const hasContent = !!content;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.previewOverlay}>
        <View style={styles.previewCard}>
          {/* 顶栏 */}
          <View style={styles.previewTopBar}>
            <View style={styles.previewTitleWrap}>
              <Text style={styles.previewTitle} numberOfLines={1}>{report.title}</Text>
              <View style={[styles.typeBadge, { backgroundColor: tm.color + '15' }]}>
                <Text style={[styles.typeBadgeText, { color: tm.color }]}>{tm.label}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* 内容区 */}
          <ScrollView style={styles.previewBody} contentContainerStyle={{ flexGrow: 1 }}>
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: 60 }} />
            ) : hasContent && isImage ? (
              <Image
                source={{ uri: content }}
                style={styles.previewImage}
                resizeMode="contain"
              />
            ) : hasContent && isPdf ? (
              // Web 上用 iframe 嵌入 PDF
              <View style={styles.previewPdfWrap}>
                <Ionicons name="document-text" size={48} color={colors.primary} />
                <Text style={styles.previewPdfText}>PDF 报告</Text>
                <TouchableOpacity
                  style={styles.previewOpenBtn}
                  onPress={() => window.open(content, '_blank')}
                >
                  <Text style={styles.previewOpenBtnText}>在新窗口打开</Text>
                  <Ionicons name="open-outline" size={14} color={colors.white} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.previewNoContent}>
                <Ionicons name="document-outline" size={48} color={colors.textMuted} />
                <Text style={styles.previewNoContentTitle}>该报告暂无预览</Text>
                <Text style={styles.previewNoContentDesc}>
                  {report.hospital ? `${report.hospital} · ` : ''}{report.date}
                  {'\n'}{report.pages ? `${report.pages} 页` : ''}{report.fileSize ? ` · ${report.fileSize}` : ''}
                </Text>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.previewCloseBtn} onPress={onClose}>
            <Text style={styles.previewCloseBtnText}>关闭</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ReportCard({ report, onDelete, onPreview }) {
  const tm = TYPE_META[report.type] || TYPE_META.annual;
  const sm = STATUS_META[report.status] || STATUS_META.pending;
  return (
    <TouchableOpacity style={styles.reportCard} activeOpacity={0.85} onPress={() => onPreview(report)}>
      <View style={[styles.reportIconWrap, { backgroundColor: tm.color + '12' }]}>
        <Ionicons name="document-text" size={24} color={tm.color} />
        <View style={[styles.reportStatusDot, { backgroundColor: sm.color }]} />
      </View>
      <View style={styles.reportBody}>
        <View style={styles.reportTitleRow}>
          <Text style={styles.reportTitle} numberOfLines={1}>{report.title}</Text>
          <View style={[styles.typeBadge, { backgroundColor: tm.color + '15' }]}>
            <Text style={[styles.typeBadgeText, { color: tm.color }]}>{tm.label}</Text>
          </View>
        </View>
        {!!report.hospital && <Text style={styles.reportHospital}>{report.hospital}</Text>}
        <Text style={styles.reportDate}>
          {report.date}{report.pages ? ` · ${report.pages}页` : ''}{report.fileSize ? ` · ${report.fileSize}` : ''}
        </Text>

        {report.keyFindings && report.keyFindings.length > 0 && (
          <View style={styles.findingsRow}>
            {report.keyFindings.map((f, i) => (
              <View key={i} style={styles.findingChip}>
                <Text style={styles.findingText}>{f}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
      <View style={styles.reportRight}>
        <View style={styles.reportRightTop}>
          <View style={[styles.statusBadge, { backgroundColor: sm.color + '15' }]}>
            <Ionicons name={sm.icon} size={12} color={sm.color} />
            <Text style={[styles.statusText, { color: sm.color }]}>{sm.label}</Text>
          </View>
          {report.audit_status === 'audited' && (
            <View style={styles.auditedBadge}>
              <Ionicons name="shield-checkmark-outline" size={11} color='#0077B6' />
              <Text style={styles.auditedBadgeText}>已审核</Text>
            </View>
          )}
        </View>
        {!!onDelete && (
          report.audit_status === 'audited' ? (
            <TouchableOpacity
              style={[styles.deleteBtn, styles.deleteBtnDisabled]}
              onPress={() => onDelete(report._id || report.id, true)}
            >
              <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => onDelete(report._id || report.id, false)} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={14} color={colors.danger} />
            </TouchableOpacity>
          )
        )}
      </View>
    </TouchableOpacity>
  );
}

function AIAnalysisCard() {
  return (
    <View style={styles.aiCard}>
      <View style={styles.aiLeft}>
        <View style={styles.aiIcon}>
          <Ionicons name="sparkles" size={20} color={colors.white} />
        </View>
        <View>
          <Text style={styles.aiTitle}>AI 智能解读</Text>
          <Text style={styles.aiDesc}>上传报告后，AI自动识别关键指标并提供解读</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.primary} />
    </View>
  );
}

// ── 上传配置 Modal ────────────────────────────────────────────────
function UploadConfigModal({ file, initialType, onConfirm, onCancel }) {
  const [title, setTitle]   = useState(file ? file.name.replace(/\.[^/.]+$/, '') : '');
  const [type, setType]     = useState(initialType && initialType !== 'all' ? initialType : 'annual');
  const [hospital, setHospital] = useState('');

  if (!file) return null;

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.previewOverlay}>
        <View style={styles.configCard}>
          <Text style={styles.configTitle}>设置报告信息</Text>
          <Text style={styles.configFile} numberOfLines={1}>📎 {file.name}</Text>

          {/* 自定义报告名 */}
          <View style={styles.configField}>
            <Text style={styles.configFieldLabel}>报告名称</Text>
            <TextInput
              style={styles.configInput}
              value={title}
              onChangeText={setTitle}
              placeholder="自定义报告名称"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* 医院 */}
          <View style={styles.configField}>
            <Text style={styles.configFieldLabel}>医院 / 机构（可选）</Text>
            <TextInput
              style={styles.configInput}
              value={hospital}
              onChangeText={setHospital}
              placeholder="如：北京协和医院"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* 类型选择 */}
          <Text style={styles.configFieldLabel}>报告类型</Text>
          <View style={styles.typeGrid}>
            {TYPE_LIST.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.typeChip, type === t.key && { backgroundColor: t.bg, borderColor: t.color }]}
                onPress={() => setType(t.key)}
                activeOpacity={0.7}
              >
                <Ionicons name={t.icon} size={15} color={type === t.key ? t.color : colors.textMuted} />
                <Text style={[styles.typeChipText, type === t.key && { color: t.color, fontWeight: '700' }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.configActions}>
            <TouchableOpacity style={styles.configCancelBtn} onPress={onCancel}>
              <Text style={styles.configCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.configConfirmBtn, !title.trim() && { opacity: 0.5 }]}
              onPress={() => title.trim() && onConfirm({ title: title.trim(), type, hospital })}
              disabled={!title.trim()}
            >
              <Text style={styles.configConfirmText}>确认上传</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── 趋势对比 Tab（#23 体检年度趋势 + #24 影像学对比）────────────────
const EXAM_TYPES    = ['annual', 'blood', 'body_comp'];
const IMAGING_TYPES = ['ultrasound', 'radiology', 'mri', 'endoscopy'];

// 趋势 Tab 专用样式（必须在组件函数之前定义，避免 TDZ）
const tStyles = StyleSheet.create({
  emptyWrap: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 4 },
  sectionIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  sectionCount: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
  sectionHint: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 17 },

  timelineWrap: { gap: 0 },

  nodeWrap: { flexDirection: 'row', gap: spacing.sm },
  axisCol: { alignItems: 'center', width: 16, paddingTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, marginBottom: 2 },
  line: { flex: 1, width: 2, backgroundColor: colors.borderLight, minHeight: 20 },

  nodeCard: {
    flex: 1, backgroundColor: colors.white,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  nodeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  nodeHeaderLeft: { flex: 1 },
  nodeHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  nodeDate: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  nodeHospital: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  typeBadgeSmall: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.full },
  typeBadgeSmallText: { fontSize: 10, fontWeight: '700' },
  statusDotSmall: { width: 7, height: 7, borderRadius: 4 },

  findingsWrap: { gap: 4 },
  findingRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  findingText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  noFindings: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },

  changeTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 8, backgroundColor: colors.warning + '12',
    borderRadius: radius.full, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },
  changeTagText: { fontSize: 11, color: colors.warning, fontWeight: '600' },

  imagingGroup: {
    backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  imagingGroupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderLight,
  },
  imagingGroupIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  imagingGroupTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textPrimary },
  imagingGroupCount: { fontSize: 12, color: colors.textMuted },
});

function TrendEmptyState({ text }) {
  return (
    <View style={tStyles.emptyWrap}>
      <Ionicons name="analytics-outline" size={32} color={colors.textMuted} />
      <Text style={tStyles.emptyText}>{text}</Text>
    </View>
  );
}

// 单条时间线节点（展示一份报告的 keyFindings）
function TimelineNode({ report, isLast, onPreview, prevReport }) {
  const tm = TYPE_META[report.type] || TYPE_META.other;
  const sm = STATUS_META[report.status] || STATUS_META.pending;
  const findings = report.keyFindings || [];

  // 简单判断是否与上一份有"变化"（findings 文本完全不同算有变化）
  const hasChange = prevReport &&
    JSON.stringify(prevReport.keyFindings) !== JSON.stringify(findings);

  return (
    <View style={tStyles.nodeWrap}>
      {/* 时间线轴 */}
      <View style={tStyles.axisCol}>
        <View style={[tStyles.dot, { backgroundColor: tm.color }]} />
        {!isLast && <View style={tStyles.line} />}
      </View>

      {/* 内容卡 */}
      <TouchableOpacity
        style={[tStyles.nodeCard, hasChange && { borderLeftColor: colors.warning, borderLeftWidth: 3 }]}
        onPress={() => onPreview(report)}
        activeOpacity={0.85}
      >
        {/* 标题行 */}
        <View style={tStyles.nodeHeader}>
          <View style={tStyles.nodeHeaderLeft}>
            <Text style={tStyles.nodeDate}>{report.date || '未知日期'}</Text>
            {!!report.hospital && (
              <Text style={tStyles.nodeHospital}>{report.hospital}</Text>
            )}
          </View>
          <View style={tStyles.nodeHeaderRight}>
            <View style={[tStyles.typeBadgeSmall, { backgroundColor: tm.color + '18' }]}>
              <Text style={[tStyles.typeBadgeSmallText, { color: tm.color }]}>{tm.label}</Text>
            </View>
            <View style={[tStyles.statusDotSmall, { backgroundColor: sm.color }]} />
          </View>
        </View>

        {/* 关键发现 */}
        {findings.length > 0 ? (
          <View style={tStyles.findingsWrap}>
            {findings.map((f, i) => (
              <View key={i} style={tStyles.findingRow}>
                <Ionicons name="ellipse" size={5} color={tm.color} style={{ marginTop: 5 }} />
                <Text style={tStyles.findingText}>{f}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={tStyles.noFindings}>暂无解读摘要，点击查看报告</Text>
        )}

        {/* 变化提示 */}
        {hasChange && (
          <View style={tStyles.changeTag}>
            <Ionicons name="git-compare-outline" size={11} color={colors.warning} />
            <Text style={tStyles.changeTagText}>与上次记录有变化</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

// 影像学分组（按类型，内部按日期排列，相邻对比）
function ImagingGroup({ type, reports, onPreview }) {
  const [expanded, setExpanded] = useState(true);
  const tm = TYPE_META[type] || TYPE_META.other;
  const sorted = [...reports].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  return (
    <View style={tStyles.imagingGroup}>
      <TouchableOpacity style={tStyles.imagingGroupHeader} onPress={() => setExpanded(v => !v)} activeOpacity={0.8}>
        <View style={[tStyles.imagingGroupIcon, { backgroundColor: tm.bg }]}>
          <Ionicons name={tm.icon} size={16} color={tm.color} />
        </View>
        <Text style={tStyles.imagingGroupTitle}>{tm.label}</Text>
        <Text style={tStyles.imagingGroupCount}>{reports.length}份</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
      </TouchableOpacity>

      {expanded && sorted.map((r, i) => (
        <TimelineNode
          key={r._id || r.id}
          report={r}
          isLast={i === sorted.length - 1}
          onPreview={onPreview}
          prevReport={i < sorted.length - 1 ? sorted[i + 1] : null}
        />
      ))}
    </View>
  );
}

function TrendsTab({ reports, onPreview }) {
  const sorted = [...reports].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const examReports    = sorted.filter(r => EXAM_TYPES.includes(r.type));
  const imagingReports = sorted.filter(r => IMAGING_TYPES.includes(r.type));

  // 影像学按类型分组
  const imagingByType = IMAGING_TYPES.reduce((acc, type) => {
    const group = imagingReports.filter(r => r.type === type);
    if (group.length > 0) acc[type] = group;
    return acc;
  }, {});

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
      {/* ── #23 体检报告年度趋势 ───────────────────────────────── */}
      <View>
        <View style={tStyles.sectionHeader}>
          <View style={[tStyles.sectionIcon, { backgroundColor: '#EBF5FB' }]}>
            <Ionicons name="calendar-outline" size={15} color="#0077B6" />
          </View>
          <Text style={tStyles.sectionTitle}>体检报告年度趋势</Text>
          <Text style={tStyles.sectionCount}>{examReports.length} 份</Text>
        </View>
        <Text style={tStyles.sectionHint}>涵盖年度体检、血液检查、人体成分，按时间倒序展示，标注关键变化</Text>

        {examReports.length === 0 ? (
          <TrendEmptyState text="暂无体检类报告，上传后自动生成趋势" />
        ) : (
          <View style={tStyles.timelineWrap}>
            {examReports.map((r, i) => (
              <TimelineNode
                key={r._id || r.id}
                report={r}
                isLast={i === examReports.length - 1}
                onPreview={onPreview}
                prevReport={i < examReports.length - 1 ? examReports[i + 1] : null}
              />
            ))}
          </View>
        )}
      </View>

      {/* ── #24 影像学检查对比 ─────────────────────────────────── */}
      <View>
        <View style={tStyles.sectionHeader}>
          <View style={[tStyles.sectionIcon, { backgroundColor: '#F2EEFF' }]}>
            <Ionicons name="scan-outline" size={15} color="#7C3AED" />
          </View>
          <Text style={tStyles.sectionTitle}>影像学检查对比</Text>
          <Text style={tStyles.sectionCount}>{imagingReports.length} 份</Text>
        </View>
        <Text style={tStyles.sectionHint}>超声、放射、磁共振、内镜按检查类型分组，对比历次结论变化</Text>

        {Object.keys(imagingByType).length === 0 ? (
          <TrendEmptyState text="暂无影像检查报告，上传后自动分组对比" />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {Object.entries(imagingByType).map(([type, reps]) => (
              <ImagingGroup key={type} type={type} reports={reps} onPreview={onPreview} />
            ))}
          </View>
        )}
      </View>

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

export default function ReportUploadScreen({ navigation, route }) {
  const { isDemo } = useAuth();
  const initialType = route?.params?.type || null;
  const [reports, setReports]       = useState([]);
  const [uploading, setUploading]   = useState(false);
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState('');
  const [toastError, setToastError] = useState(false);
  const [previewReport, setPreviewReport] = useState(null);

  // Upload config modal state
  const [pendingFile, setPendingFile] = useState(null);
  const pendingFileData = useRef(null); // stores { content, mimeType, sizeStr }

  const showToast = (msg, isError = false) => {
    setToast(msg);
    setToastError(isError);
    setTimeout(() => setToast(''), 2500);
  };

  const loadReports = useCallback(async () => {
    try {
      const res = await reportsAPI.list();
      if (res.success && res.data.length > 0) setReports(res.data);
      else setReports(isDemo ? mockMedicalReports : []);
    } catch {
      setReports(isDemo ? mockMedicalReports : []);
    } finally {
      setLoading(false);
    }
  }, [isDemo]);

  useEffect(() => { loadReports(); }, [loadReports]);

  // Step 1: Pick file → show config modal
  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024) {
        showToast('文件大小不能超过 20MB', true);
        return;
      }

      const sizeKB = file.size / 1024;
      const sizeStr = sizeKB >= 1024
        ? `${(sizeKB / 1024).toFixed(1)}MB`
        : `${sizeKB.toFixed(0)}KB`;
      const mimeType = file.type || '';
      let content = '';
      if (file.size < 3 * 1024 * 1024) {
        try {
          content = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        } catch {}
      }
      pendingFileData.current = { content, mimeType, sizeStr };
      setPendingFile(file);
    };
    input.click();
  };

  // Step 2: User confirmed config → submit
  const handleConfirmUpload = async ({ title, type, hospital }) => {
    const fd = pendingFileData.current;
    setPendingFile(null);
    if (!fd) return;

    setUploading(true);
    try {
      const payload = {
        title,
        type,
        hospital,
        date: new Date().toISOString().slice(0, 10),
        pages: 1,
        fileSize: fd.sizeStr,
        keyFindings: [],
        note: '',
        content: fd.content,
        mimeType: fd.mimeType,
      };
      const res = await reportsAPI.create(payload);
      if (res.success) {
        setReports(prev => [res.data, ...prev]);
        showToast('上传成功');
      } else {
        showToast('上传失败，请重试', true);
      }
    } catch (err) {
      showToast(err.message || '上传失败，请重试', true);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id, isAudited) => {
    if (isAudited) {
      showToast('已审核报告不可删除，如需处理请联系健康管理师', true);
      return;
    }
    try {
      const res = await reportsAPI.delete(id);
      if (res.success) {
        setReports(prev => prev.filter(r => (r._id || r.id) !== id));
        showToast('已删除');
      }
    } catch (err) {
      showToast(err.message || '删除失败', true);
    }
  };

  const isRealReport = (r) => !!(r._id);
  const [typeFilter, setTypeFilter] = useState(initialType || 'all');
  // 页面 Tab：体检报告 / 动态监测
  const [pageTab, setPageTab] = useState('reports');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>健康报告</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* 页面 Tab 切换 */}
      <View style={styles.pageTabs}>
        {[{ key: 'reports', label: '体检报告' }, { key: 'trends', label: '趋势对比' }, { key: 'monitoring', label: '居家监测' }].map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.pageTab, pageTab === t.key && styles.pageTabActive]}
            onPress={() => setPageTab(t.key)}
          >
            <Text style={[styles.pageTabText, pageTab === t.key && styles.pageTabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── 趋势对比 Tab ──────────────────────────────────────────── */}
      {pageTab === 'trends' ? (
        <TrendsTab reports={reports} onPreview={setPreviewReport} />
      ) : pageTab === 'monitoring' ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          {/* 居家自测设备 */}
          <Text style={styles.monitorSectionTitle}>居家自测设备</Text>
          {[
            { key: 'bp_home',     label: '血压监测',   subtitle: '家用血压计自测记录',       icon: 'heart-outline',      color: '#DC3545', bg: '#FDEEEC' },
            { key: 'sugar_home',  label: '血糖监测',   subtitle: '家用血糖仪自测记录',       icon: 'water-outline',      color: '#D97706', bg: '#FEF3E2' },
            { key: 'weight_home', label: '体重监测',   subtitle: '体重秤自测记录',           icon: 'scale-outline',      color: '#22A06B', bg: '#E8F8F1' },
            { key: 'sleep_home',  label: '睡眠监测',   subtitle: '睡眠手环/枕头监测记录',    icon: 'moon-outline',       color: '#0077B6', bg: '#E3F2FB' },
          ].map(item => (
            <View key={item.key} style={styles.monitorCard}>
              <View style={[styles.monitorIconWrap, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={26} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.monitorLabel}>{item.label}</Text>
                <Text style={styles.monitorSubtitle}>{item.subtitle}</Text>
                <View style={styles.monitorComingSoon}>
                  <Ionicons name="sync-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.monitorComingSoonText}>即将支持设备同步</Text>
                </View>
              </View>
              <View style={styles.monitorBadge}>
                <Text style={styles.monitorBadgeText}>即将开放</Text>
              </View>
            </View>
          ))}
          {/* 专业动态监测 */}
          <Text style={[styles.monitorSectionTitle, { marginTop: spacing.sm }]}>专业动态监测</Text>
          {[
            { key: 'abpm',   label: '动态血压',   subtitle: '24h动态血压监测（ABPM）', icon: 'heart-outline',    color: '#DC3545', bg: '#FDEEEC' },
            { key: 'cgm',    label: '动态血糖',   subtitle: '持续葡萄糖监测（CGM）',    icon: 'water-outline',    color: '#D97706', bg: '#FEF3E2' },
            { key: 'holter', label: '动态心电',   subtitle: '24h动态心电监测（Holter）',icon: 'pulse-outline',    color: '#7C3AED', bg: '#F2EEFF' },
          ].map(item => (
            <View key={item.key} style={styles.monitorCard}>
              <View style={[styles.monitorIconWrap, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon} size={26} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.monitorLabel}>{item.label}</Text>
                <Text style={styles.monitorSubtitle}>{item.subtitle}</Text>
                <View style={styles.monitorComingSoon}>
                  <Ionicons name="sync-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.monitorComingSoonText}>即将支持自动同步</Text>
                </View>
              </View>
              <View style={styles.monitorBadge}>
                <Text style={styles.monitorBadgeText}>即将开放</Text>
              </View>
            </View>
          ))}
          <View style={{ height: spacing.xl }} />
        </ScrollView>
      ) : (

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Upload Zone */}
        <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.md }}>
          <UploadZone onPress={handleUpload} uploading={uploading} />
        </View>

        {/* AI Analysis */}
        <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.sm }}>
          <AIAnalysisCard />
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          {[
            { label: '报告总数', value: reports.length,                                          icon: 'documents',       color: colors.primary  },
            { label: '已解读',   value: reports.filter(r => r.status !== 'pending').length,      icon: 'checkmark-done',  color: colors.success  },
            { label: '待解读',   value: reports.filter(r => r.status === 'pending').length,      icon: 'time',            color: colors.warning  },
          ].map((s, i) => (
            <View key={i} style={styles.statCard}>
              <Ionicons name={s.icon} size={18} color={s.color} />
              <Text style={[styles.statVal, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Reports List */}
        <View style={{ marginTop: spacing.sm }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.xs }}>
            <Text style={styles.sectionTitle}>历史报告</Text>
          </View>
          {/* Type filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: spacing.xs, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}
          >
            <TouchableOpacity
              style={[styles.filterChip, typeFilter === 'all' && styles.filterChipActive]}
              onPress={() => setTypeFilter('all')}
            >
              <Text style={[styles.filterChipText, typeFilter === 'all' && styles.filterChipTextActive]}>全部</Text>
            </TouchableOpacity>
            {TYPE_LIST.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[
                  styles.filterChip,
                  typeFilter === t.key && { backgroundColor: t.bg, borderColor: t.color },
                ]}
                onPress={() => setTypeFilter(t.key)}
              >
                <Ionicons name={t.icon} size={12} color={typeFilter === t.key ? t.color : colors.textMuted} />
                <Text style={[styles.filterChipText, typeFilter === t.key && { color: t.color, fontWeight: '700' }]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={{ marginHorizontal: spacing.lg }}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : reports.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="document-outline" size={40} color={colors.textMuted} />
              <Text style={styles.emptyText}>暂无报告，点击上方上传</Text>
            </View>
          ) : (() => {
            const filtered = typeFilter === 'all' ? reports : reports.filter(r => r.type === typeFilter);
            return filtered.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="filter-outline" size={36} color={colors.textMuted} />
                <Text style={styles.emptyText}>该类型暂无报告</Text>
              </View>
            ) : (
              <View style={styles.reportsList}>
                {filtered.map(r => (
                  <ReportCard
                    key={r._id || r.id}
                    report={r}
                    onDelete={null}
                    onPreview={setPreviewReport}
                  />
                ))}
              </View>
            );
          })()}
          </View>
        </View>

        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>

      )} {/* end pageTab === 'reports' conditional */}

      <Toast msg={toast} isError={toastError} />

      {previewReport && (
        <ReportPreviewModal report={previewReport} onClose={() => setPreviewReport(null)} />
      )}

      {pendingFile && (
        <UploadConfigModal
          file={pendingFile}
          initialType={typeFilter}
          onConfirm={handleConfirmUpload}
          onCancel={() => { setPendingFile(null); pendingFileData.current = null; }}
        />
      )}
    </SafeAreaView>
  );
}
