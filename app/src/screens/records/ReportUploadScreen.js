import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, ActivityIndicator,
  Modal, Image, Platform, Linking, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { colors, spacing, radius, shadow } from '../../theme';
import { reportsAPI, requisitionsAPI, plansAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { mockMedicalReports } from '../../data/mockData';

// ── 筛查报告类型 ─────────────────────────────────────────────────
// 2026-07 对齐医护端 admin 后台「分类管理」的一级分类名称（ProjectCategory L1），此前用户端
// 这里是另一套10个写死分类、名字和医护端各自维护，两边对不上；改成跟医护端相同的7个类别名称。
const TYPE_LIST = [
  { key: 'general_exam',    label: '一般检查',       icon: 'clipboard-outline',    color: '#0077B6', bg: '#EBF5FB' },
  { key: 'tumor',           label: '肿瘤筛查',       icon: 'flask-outline',         color: '#DC3545', bg: '#FDEEEC' },
  { key: 'cardiovascular',  label: '心脑血管病筛查', icon: 'heart-outline',         color: '#9D174D', bg: '#FCE7F3' },
  { key: 'chronic',         label: '慢性病筛查',     icon: 'medical-outline',       color: '#D97706', bg: '#FEF3E2' },
  { key: 'functional',      label: '功能医学检测',   icon: 'flask-outline',         color: '#7C3AED', bg: '#F2EEFF' },
  { key: 'gender_health',   label: '男性/女性健康筛查', icon: 'body-outline',       color: '#059669', bg: '#D1FAE5' },
  // 居家监测设备产出的报告（动态血压/动态血糖/动态心电图/肺功能等），2026-07-17需求新增
  { key: 'home_monitor',   label: '居家监测',       icon: 'watch-outline',         color: '#0891B2', bg: '#E0F7FA' },
  { key: 'other',           label: '其他常规筛查',   icon: 'document-outline',      color: '#64748B', bg: '#F1F5F9' },
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

  // 删除确认弹窗
  confirmOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  confirmBox: {
    backgroundColor: colors.white, borderRadius: radius.lg,
    padding: spacing.lg, width: '100%', maxWidth: 320,
  },
  confirmTitle:   { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  confirmMessage: { fontSize: 14, color: colors.textSecondary, lineHeight: 21, textAlign: 'center', marginBottom: spacing.lg },
  confirmBtnRow:  { flexDirection: 'row', gap: spacing.sm },
  confirmCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: radius.md,
    borderWidth: 1.5, borderColor: colors.border, alignItems: 'center',
  },
  confirmCancelText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  confirmOkBtn: {
    flex: 1, paddingVertical: 12, borderRadius: radius.md,
    backgroundColor: colors.danger, alignItems: 'center',
  },
  confirmOkText: { fontSize: 14, color: colors.white, fontWeight: '700' },

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

function ConfirmDeleteModal({ visible, onConfirm, onCancel, loading }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmBox}>
          <Text style={styles.confirmTitle}>删除报告</Text>
          <Text style={styles.confirmMessage}>确定删除该报告吗？删除后将同步清除关联的指标数据，且不可恢复。</Text>
          <View style={styles.confirmBtnRow}>
            <TouchableOpacity style={styles.confirmCancelBtn} onPress={onCancel} activeOpacity={0.8}>
              <Text style={styles.confirmCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmOkBtn, loading && { opacity: 0.6 }]}
              onPress={onConfirm}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator size="small" color={colors.white} />
                : <Text style={styles.confirmOkText}>确认删除</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function UploadZone({ onPress, uploading, typeFilter }) {
  const tm = typeFilter && typeFilter !== 'all' ? TYPE_META[typeFilter] : null;
  const title   = uploading ? '上传中…' : tm ? `上传${tm.label}报告` : '上传体检报告';
  const iconColor = tm?.color || colors.primary;
  const iconBg    = tm ? tm.bg : colors.primary + '12';
  return (
    <TouchableOpacity
      style={[styles.uploadZone, tm && { borderColor: tm.color + '50' }]}
      onPress={onPress} activeOpacity={0.8} disabled={uploading}
    >
      <View style={[styles.uploadIconWrap, { backgroundColor: iconBg }]}>
        {uploading
          ? <ActivityIndicator color={iconColor} size="large" />
          : <Ionicons name={tm ? tm.icon : 'cloud-upload-outline'} size={32} color={iconColor} />
        }
      </View>
      <Text style={[styles.uploadTitle, tm && { color: tm.color }]}>{title}</Text>
      <Text style={styles.uploadDesc}>支持 PDF、JPG、PNG 格式{'\n'}单文件最大 20MB</Text>
      {!uploading && (
        <View style={styles.uploadBtnRow}>
          <TouchableOpacity
            style={[styles.uploadOptionBtn, tm && { borderColor: tm.color + '60', backgroundColor: tm.bg }]}
            onPress={onPress}
          >
            <Ionicons name="document-outline" size={16} color={iconColor} />
            <Text style={[styles.uploadOptionText, tm && { color: tm.color }]}>选择文件</Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

// 后端 fileUrl 存的是相对路径（如 /api/uploads/reports/xxx.pdf），拼上域名才能直接加载
const FILE_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://jiaycare.com/api').replace(/\/api$/, '');
function resolveFileUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url) || url.startsWith('data:')) return url;
  return FILE_BASE_URL + url;
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
          const data = res.data;
          // 新上传流程走 OSS/服务器存储只有 fileUrl，没有 base64 content——必须优先用 fileUrl，
          // 否则这类报告在预览弹窗里会一直落到"暂无预览"分支（content 字段为空）
          const fileUrl = data.fileUrls?.[0] || data.fileUrl || '';
          setContent(fileUrl ? resolveFileUrl(fileUrl) : (data.content || ''));
          setMimeType(data.mimeType || '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [report]);

  if (!report) return null;
  const tm = TYPE_META[report.type] || TYPE_META.other;
  // 优先用 mimeType，fallback 到 content/URL 后缀检测（兼容 mimeType 未存储的旧数据）
  const isImage = mimeType.startsWith('image/') || content.startsWith('data:image/') || /\.(png|jpe?g|gif|webp)$/i.test(content);
  const isPdf   = mimeType === 'application/pdf' || content.startsWith('data:application/pdf') || /\.pdf$/i.test(content);
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
                  onPress={() => {
                    // Web端用window.open；移动原生端window不存在，用Linking打开系统浏览器/PDF查看器
                    if (Platform.OS === 'web') window.open(content, '_blank');
                    else Linking.openURL(content).catch(() => {});
                  }}
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
  const tm = TYPE_META[report.type] || TYPE_META.other;
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

function AIAnalysisCard({ onPress }) {
  return (
    <TouchableOpacity style={styles.aiCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.aiLeft}>
        <View style={styles.aiIcon}>
          <Ionicons name="sparkles" size={20} color={colors.white} />
        </View>
        <View>
          <Text style={styles.aiTitle}>AI 健康分析</Text>
          <Text style={styles.aiDesc}>结合您的体检报告与健康档案，生成综合分析</Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.primary} />
    </TouchableOpacity>
  );
}

// 将 base64 图片按角度（90的倍数）旋转，返回新的 base64 data URI（原生实现，仅支持图片，PDF 不处理）
// 此前用 window.Image + Canvas 实现，在真机 App（非 Expo web 预览）里 document/window.Image 均不存在，
// 一进旋转步骤就会崩溃——2026-07-18 排查"用户端多图上传不行"发现的根因之一，改用 expo-image-manipulator。
async function rotateImageBase64(dataUrl, degrees) {
  const result = await ImageManipulator.manipulateAsync(
    dataUrl,
    [{ rotate: degrees }],
    { compress: 0.92, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  return `data:image/jpeg;base64,${result.base64}`;
}

// ── 多图预览 + 旋转 Modal ─────────────────────────────────────────
// 上传后先在这里确认每张图的朝向（体检报告拍照经常是横的/倒的，AI解析前必须摆正），
// 逐张旋转，确认后再进入 UploadConfigModal 填标题/医院/类型
function ImageRotatePreviewModal({ pages, onConfirm, onCancel }) {
  const [items, setItems] = useState(pages); // [{ name, mimeType, content, sizeStr }]
  const [activeIndex, setActiveIndex] = useState(0);
  const [rotating, setRotating] = useState(false);

  if (!items.length) return null;
  const active = items[activeIndex];
  const isImage = (active.mimeType || '').startsWith('image/');

  const handleRotate = async () => {
    if (!isImage || rotating) return;
    setRotating(true);
    try {
      const rotated = await rotateImageBase64(active.content, 90);
      setItems(prev => prev.map((it, i) => i === activeIndex ? { ...it, content: rotated } : it));
    } catch {
      // 旋转失败保留原图，不阻塞流程
    } finally {
      setRotating(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.previewOverlay}>
        <View style={styles.previewCard}>
          <View style={styles.previewTopBar}>
            <View style={styles.previewTitleWrap}>
              <Text style={styles.previewTitle}>确认图片方向（{activeIndex + 1}/{items.length}）</Text>
            </View>
            <TouchableOpacity onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.previewBody} contentContainerStyle={{ flexGrow: 1 }}>
            {isImage ? (
              <Image source={{ uri: active.content }} style={styles.previewImage} resizeMode="contain" />
            ) : (
              <View style={styles.previewNoContent}>
                <Ionicons name="document-text" size={48} color={colors.primary} />
                <Text style={styles.previewNoContentTitle}>{active.name}</Text>
                <Text style={styles.previewNoContentDesc}>PDF 文件不支持旋转，直接进入下一步即可</Text>
              </View>
            )}
          </ScrollView>

          {isImage && (
            <TouchableOpacity
              style={[styles.uploadOptionBtn, { alignSelf: 'center', marginBottom: spacing.sm }]}
              onPress={handleRotate}
              disabled={rotating}
            >
              {rotating
                ? <ActivityIndicator size="small" color={colors.primary} />
                : <Ionicons name="reload-outline" size={16} color={colors.primary} />
              }
              <Text style={styles.uploadOptionText}>旋转90°</Text>
            </TouchableOpacity>
          )}

          {items.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
              {items.map((it, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setActiveIndex(i)}
                  style={{
                    marginRight: spacing.xs, borderRadius: radius.sm, overflow: 'hidden',
                    borderWidth: 2, borderColor: i === activeIndex ? colors.primary : 'transparent',
                  }}
                >
                  {(it.mimeType || '').startsWith('image/') ? (
                    <Image source={{ uri: it.content }} style={{ width: 56, height: 56 }} resizeMode="cover" />
                  ) : (
                    <View style={{ width: 56, height: 56, backgroundColor: colors.borderLight, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="document-text-outline" size={22} color={colors.textMuted} />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TouchableOpacity style={styles.configCancelBtn} onPress={onCancel}>
              <Text style={styles.configCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.configConfirmBtn} onPress={() => onConfirm(items)}>
              <Text style={styles.configConfirmText}>{items.length > 1 ? '确认，下一步' : '确认方向，下一步'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── 上传配置 Modal ────────────────────────────────────────────────
function UploadConfigModal({ file, initialType, onConfirm, onCancel }) {
  const [title, setTitle]   = useState(file ? file.name.replace(/\.[^/.]+$/, '') : '');
  const [type, setType]     = useState(initialType && initialType !== 'all' ? initialType : TYPE_LIST[0].key);
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

// ── 趋势对比 Tab（所有报告类型历年对比）────────────────────────────

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
  // 按 TYPE_LIST 顺序分组，保留有报告的类型
  const groupedByType = TYPE_LIST.reduce((acc, tm) => {
    const group = reports.filter(r => r.type === tm.key);
    if (group.length > 0) acc.push({ key: tm.key, reports: group });
    return acc;
  }, []);

  // 其他未识别类型兜底
  const knownKeys = new Set(TYPE_LIST.map(t => t.key));
  const unknownReports = reports.filter(r => !knownKeys.has(r.type));
  if (unknownReports.length > 0) groupedByType.push({ key: 'other', reports: unknownReports });

  const totalCount = reports.length;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
      {/* ── 顶部说明 ─── */}
      <View style={tStyles.sectionHeader}>
        <View style={[tStyles.sectionIcon, { backgroundColor: colors.primary + '15' }]}>
          <Ionicons name="analytics-outline" size={15} color={colors.primary} />
        </View>
        <Text style={tStyles.sectionTitle}>历年报告对比</Text>
        <Text style={tStyles.sectionCount}>{totalCount} 份</Text>
      </View>
      <Text style={[tStyles.sectionHint, { marginTop: -spacing.xs }]}>
        同类报告按时间倒序排列，相邻两次有变化时高亮提示
      </Text>

      {/* ── 按类型分组，每组一个可折叠块 ─── */}
      {groupedByType.length === 0 ? (
        <TrendEmptyState text="暂无报告，上传报告后自动生成历年对比" />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {groupedByType.map(({ key, reports: reps }) => (
            <ImagingGroup key={key} type={key} reports={reps} onPreview={onPreview} />
          ))}
        </View>
      )}

      <View style={{ height: spacing.xl }} />
    </ScrollView>
  );
}

export default function ReportUploadScreen({ navigation, route }) {
  const { isDemo } = useAuth();
  const initialType = route?.params?.type || null;
  const [reports, setReports]       = useState([]);
  const [requisitions, setRequisitions] = useState([]);
  const [reqExpanded, setReqExpanded]   = useState(true);
  const [annualCheckupPlans, setAnnualCheckupPlans] = useState([]);
  const [uploading, setUploading]   = useState(false);
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState('');
  const [toastError, setToastError] = useState(false);
  const [previewReport, setPreviewReport] = useState(null);

  // Upload flow state：先选图 → 预览旋转 → 填信息确认
  const [pendingPages, setPendingPages] = useState(null);   // [{ name, content, mimeType, sizeStr }]，多图预览旋转阶段
  const [pendingFile, setPendingFile] = useState(null);       // 旋转确认后进入填写信息阶段（沿用原 file 展示逻辑，取首张）
  const pendingFileData = useRef(null); // stores { pages: [{ content, mimeType, sizeStr }], sizeStr }

  // Delete confirm modal state
  const [deleteTarget, setDeleteTarget] = useState(null); // reportId to delete
  const [deleting, setDeleting] = useState(false);

  const showToast = (msg, isError = false) => {
    setToast(msg);
    setToastError(isError);
    setTimeout(() => setToast(''), 2500);
  };

  const loadRequisitions = useCallback(async () => {
    if (isDemo) return;
    try {
      const [reqRes, plansRes] = await Promise.allSettled([
        requisitionsAPI.list(),
        plansAPI.list(),
      ]);
      if (reqRes.status === 'fulfilled' && reqRes.value?.success) {
        setRequisitions(reqRes.value.data || []);
      }
      if (plansRes.status === 'fulfilled' && plansRes.value?.success) {
        const checkupPlans = (plansRes.value.data || []).filter(p => p.type === 'annual_checkup' || p.type === 'checkup');
        setAnnualCheckupPlans(checkupPlans);
      }
    } catch { /* ignore */ }
  }, [isDemo]);

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

  useEffect(() => { loadReports(); loadRequisitions(); }, [loadReports, loadRequisitions]);

  const MAX_FILE_BYTES = 20 * 1024 * 1024;

  const fileSizeStr = (bytes) => {
    const kb = bytes / 1024;
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)}MB` : `${kb.toFixed(0)}KB`;
  };

  // 相册多选图片（作为同一份报告的多页）。expo-image-picker 直接支持 base64 输出，
  // 不用再手动读文件，天然兼容真机
  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast('未获得相册权限，请在系统设置中开启', true);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled || !result.assets?.length) return;

    const oversized = result.assets.find(a => (a.fileSize || 0) > MAX_FILE_BYTES);
    if (oversized) {
      showToast('文件大小不能超过 20MB', true);
      return;
    }
    const pages = result.assets.map((a, i) => ({
      name: a.fileName || `photo_${i + 1}.jpg`,
      content: `data:${a.mimeType || 'image/jpeg'};base64,${a.base64}`,
      mimeType: a.mimeType || 'image/jpeg',
      sizeStr: fileSizeStr(a.fileSize || (a.base64.length * 0.75)),
    }));
    setPendingPages(pages);
  };

  // 拍照上传（单张，报告现场拍摄场景）
  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showToast('未获得相机权限，请在系统设置中开启', true);
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.85, base64: true });
    if (result.canceled || !result.assets?.length) return;

    const a = result.assets[0];
    if ((a.fileSize || 0) > MAX_FILE_BYTES) {
      showToast('文件大小不能超过 20MB', true);
      return;
    }
    setPendingPages([{
      name: a.fileName || 'photo.jpg',
      content: `data:${a.mimeType || 'image/jpeg'};base64,${a.base64}`,
      mimeType: a.mimeType || 'image/jpeg',
      sizeStr: fileSizeStr(a.fileSize || (a.base64.length * 0.75)),
    }]);
  };

  // 选择 PDF 等文件（医院电子报告常见格式），不支持多选+旋转预览，直接进下一步
  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;

    const oversized = result.assets.find(a => (a.size || 0) > MAX_FILE_BYTES);
    if (oversized) {
      showToast('文件大小不能超过 20MB', true);
      return;
    }
    try {
      const pages = await Promise.all(result.assets.map(async (a) => {
        const base64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 });
        const mimeType = a.mimeType || 'application/pdf';
        return { name: a.name, content: `data:${mimeType};base64,${base64}`, mimeType, sizeStr: fileSizeStr(a.size || 0) };
      }));
      setPendingPages(pages);
    } catch {
      showToast('文件读取失败，请重试', true);
    }
  };

  // Step 1: Pick file(s) → show rotate/preview modal
  const handleUpload = () => {
    Alert.alert('上传报告', '请选择上传方式', [
      { text: '拍照', onPress: pickFromCamera },
      { text: '从相册选择（可多选）', onPress: pickFromLibrary },
      { text: '选择文件（PDF）', onPress: pickDocument },
      { text: '取消', style: 'cancel' },
    ]);
  };

  // Step 2: User confirmed rotation/orientation → show config modal
  const handleConfirmRotate = (rotatedPages) => {
    setPendingPages(null);
    const totalKB = rotatedPages.reduce((s, p) => s + (p.content?.length || 0) * 0.75 / 1024, 0);
    const sizeStr = totalKB >= 1024 ? `${(totalKB / 1024).toFixed(1)}MB` : `${totalKB.toFixed(0)}KB`;
    pendingFileData.current = { pages: rotatedPages, sizeStr };
    setPendingFile({ name: rotatedPages.length > 1 ? `${rotatedPages[0].name} 等${rotatedPages.length}张` : rotatedPages[0].name });
  };

  // Step 3: User confirmed config → submit, then trigger AI re-parse
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
        pages: fd.pages.length,
        fileSize: fd.sizeStr,
        keyFindings: [],
        note: '',
        contents: fd.pages.map(p => p.content),
        mimeType: fd.pages[0].mimeType,
      };
      const res = await reportsAPI.create(payload);
      if (res.success) {
        setReports(prev => [res.data, ...prev]);
        setTypeFilter(type);   // 自动切换到对应 tab
        showToast('上传成功，正在AI解析…');
        // 上传后立即触发AI解析（此前一直没有屏幕调用这个接口，报告只能停在"待解读"等人工处理）
        const reportId = res.data._id || res.data.id;
        reportsAPI.parseAI(reportId).catch(() => {});
      } else {
        showToast('上传失败，请重试', true);
      }
    } catch (err) {
      showToast(err.message || '上传失败，请重试', true);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = (id, isAudited) => {
    if (isAudited) {
      showToast('已审核，不可删除，请联系健管专员', true);
      return;
    }
    setDeleteTarget(id);
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await reportsAPI.delete(deleteTarget);
      if (res.success) {
        setReports(prev => prev.filter(r => (r._id || r.id) !== deleteTarget));
        setDeleteTarget(null);
        showToast('报告已删除');
      } else {
        showToast(res.message || '删除失败', true);
        setDeleteTarget(null);
      }
    } catch (err) {
      showToast(err.message || '删除失败，请重试', true);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
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

      {/* 待上传开单提示 */}
      {requisitions.filter(r => r.status === 'open' || r.status === 'partial').length > 0 && (
        <View style={{ backgroundColor: '#FEF3C7', borderBottomWidth: 1, borderBottomColor: '#FDE68A' }}>
          <TouchableOpacity
            onPress={() => setReqExpanded(v => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, paddingBottom: reqExpanded ? spacing.xs : spacing.md }}
            activeOpacity={0.8}
          >
            <Ionicons name="clipboard-outline" size={16} color="#D97706" />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#92400E', marginLeft: 6 }}>
              待上传检查单（{requisitions.filter(r => r.status === 'open' || r.status === 'partial').reduce((s, r) => s + (r.items || []).filter(i => i.status === 'pending').length, 0)}项待上传）
            </Text>
            <Ionicons name={reqExpanded ? 'chevron-up' : 'chevron-down'} size={14} color="#92400E" />
          </TouchableOpacity>
          {reqExpanded && requisitions.filter(r => r.status === 'open' || r.status === 'partial').map(r => (
            <View key={r._id} style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#1A2B24', marginBottom: 4 }}>
                {r.title || '检查开单'} · {r.staffId?.name ? r.staffId.name + '开单' : ''} · {new Date(r.createdAt).toLocaleDateString('zh-CN')}
              </Text>
              {(r.items || []).filter(i => i.status === 'pending').map((item, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4, paddingLeft: 8 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#D97706', marginRight: 8 }} />
                  <Text style={{ flex: 1, fontSize: 12, color: '#4A6558' }}>{item.itemName}</Text>
                  {item.notes ? <Text style={{ fontSize: 11, color: '#8AA89C' }}>{item.notes}</Text> : null}
                  <TouchableOpacity
                    onPress={handleUpload}
                    style={{ marginLeft: 8, backgroundColor: '#1E6B50', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 }}
                  >
                    <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>上传</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}

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
          <UploadZone onPress={handleUpload} uploading={uploading} typeFilter={typeFilter} />
        </View>

        {/* AI Analysis */}
        <View style={{ marginHorizontal: spacing.lg, marginTop: spacing.sm }}>
          <AIAnalysisCard onPress={() => navigation.navigate('AiHealth')} />
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

        {/* 类型筛选 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.xs, marginTop: spacing.md, paddingBottom: spacing.xs }}>
          <TouchableOpacity
            style={[styles.filterChip, typeFilter === 'all' && styles.filterChipActive]}
            onPress={() => setTypeFilter('all')} activeOpacity={0.8}>
            <Text style={[styles.filterChipText, typeFilter === 'all' && styles.filterChipTextActive]}>全部</Text>
          </TouchableOpacity>
          {TYPE_LIST.map(t => (
            <TouchableOpacity key={t.key}
              style={[styles.filterChip, typeFilter === t.key && styles.filterChipActive]}
              onPress={() => setTypeFilter(t.key)} activeOpacity={0.8}>
              <Text style={[styles.filterChipText, typeFilter === t.key && styles.filterChipTextActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* 报告列表 */}
        {loading ? (
          <View style={styles.loadingWrap}><ActivityIndicator color={colors.primary} /></View>
        ) : (() => {
          const filtered = (typeFilter === 'all' ? reports : reports.filter(r => r.type === typeFilter)).filter(r => !!r._id);
          return filtered.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="document-outline" size={36} color={colors.textMuted} />
              <Text style={styles.emptyText}>暂无{typeFilter !== 'all' ? (TYPE_META[typeFilter]?.label || '') : ''}报告</Text>
            </View>
          ) : (
            <View style={[styles.reportsList, { marginHorizontal: spacing.lg, marginTop: spacing.sm }]}>
              {filtered.map(r => (
                <ReportCard key={r._id} report={r} onDelete={handleDelete} onPreview={setPreviewReport} />
              ))}
            </View>
          );
        })()}

        <View style={{ height: spacing.xl * 2 }} />
      </ScrollView>

      )} {/* end pageTab === 'reports' conditional */}

      <Toast msg={toast} isError={toastError} />

      {previewReport && (
        <ReportPreviewModal report={previewReport} onClose={() => setPreviewReport(null)} />
      )}

      {pendingPages && (
        <ImageRotatePreviewModal
          pages={pendingPages}
          onConfirm={handleConfirmRotate}
          onCancel={() => setPendingPages(null)}
        />
      )}

      {pendingFile && (
        <UploadConfigModal
          file={pendingFile}
          initialType={typeFilter}
          onConfirm={handleConfirmUpload}
          onCancel={() => { setPendingFile(null); pendingFileData.current = null; }}
        />
      )}

      <ConfirmDeleteModal
        visible={!!deleteTarget}
        loading={deleting}
        onConfirm={executeDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </SafeAreaView>
  );
}
