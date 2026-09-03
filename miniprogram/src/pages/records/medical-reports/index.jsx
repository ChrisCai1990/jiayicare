import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Input, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { reportsAPI } from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';

// 对齐 app/src/screens/records/MedicalReportsScreen.js
// 小程序场景适配：原件通过普通鉴权请求读取二进制，写入带正确后缀的本地文件后预览，
// 不是 app 端的 Linking.openURL 系统浏览器打开方式
const CATEGORY_META = {
  tumor: { label: '常见肿瘤筛查', icon: '🔬', color: '#DC3545' },
  cardiovascular: { label: '心血管筛查', icon: '❤️', color: '#E91E63' },
  brain_vessel: { label: '脑血管病筛查', icon: '🧠', color: '#7C3AED' },
  chronic: { label: '慢性病筛查', icon: '💊', color: '#D97706' },
  other_routine: { label: '其他常规筛查', icon: '📄', color: '#0077B6' },
  health_promote: { label: '健康促进筛查', icon: '🌿', color: '#1E6B50' },
};
const ITEM_STATUS_COLOR = { normal: colors.success, abnormal: colors.danger, attention: colors.warning, unknown: colors.textMuted };
const ITEM_STATUS_LABEL = { normal: '正常', abnormal: '异常', attention: '关注', unknown: '未知' };

async function openOriginalFile(report) {
  const fileCount = report.fileUrls?.length || (report.fileUrl ? 1 : 0);
  if (fileCount) {
    const isImage = report.mimeType?.startsWith('image/');
    Taro.showLoading({ title: '正在打开...' });
    try {
      const downloaded = await Promise.all(Array.from({ length: fileCount }, (_, index) => (
        reportsAPI.downloadOriginal(report._id, index, report.mimeType || '')
      )));
      Taro.hideLoading();
      if (isImage) {
        await Taro.previewImage({ urls: downloaded, current: downloaded[0] });
      } else {
        await Taro.openDocument({ filePath: downloaded[0], fileType: 'pdf', showMenu: true });
      }
    } catch (err) {
      Taro.hideLoading();
      Taro.showModal({
        title: '原始报告打开失败',
        content: err?.message || err?.errMsg || '无法打开原始文件，请稍后重试',
        showCancel: false,
        confirmText: '知道了',
      });
    }
    return;
  }
  if (report.hasContent) {
    try {
      const res = await reportsAPI.get(report._id);
      const full = res.data;
      if (!full?.content) throw new Error('原始文件内容为空');
      const mimeType = full.mimeType || '';
      const isImage = mimeType.startsWith('image/');
      const ext = mimeType === 'application/pdf' ? 'pdf'
        : mimeType.includes('png') ? 'png'
        : mimeType.includes('webp') ? 'webp' : 'jpg';
      const raw = String(full.content).replace(/^data:[^;]+;base64,/, '');
      const filePath = `${Taro.env.USER_DATA_PATH}/report-${report._id}.${ext}`;
      await new Promise((resolve, reject) => {
        Taro.getFileSystemManager().writeFile({
          filePath, data: raw, encoding: 'base64', success: resolve,
          fail: (err) => reject(new Error(err?.errMsg || '文件保存失败')),
        });
      });
      if (isImage) await Taro.previewImage({ urls: [filePath], current: filePath });
      else await Taro.openDocument({ filePath, fileType: 'pdf', showMenu: true });
    } catch (err) {
      Taro.showToast({ title: err?.message || '无法加载原始文件', icon: 'none' });
    }
    return;
  }
  Taro.showToast({ title: '该报告未上传原始文件', icon: 'none' });
}

function ReportItemRow({ item }) {
  const statusColor = ITEM_STATUS_COLOR[item.status] || colors.textMuted;
  const isImaging = item.itemType === 'imaging' || (!item.value && (item.findings || item.diagnosis));
  if (isImaging) {
    const findings = item.findings || item.value || '';
    return (
      <View style={{ padding: '7px 0', borderBottom: `1px solid ${colors.borderLight}` }}>
        <View style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Text style={{ fontSize: '13px', color: colors.textPrimary, fontWeight: 500 }}>{item.name}</Text>
          {!!item.bodyPart && <Text style={{ fontSize: '11px', color: colors.textMuted }}>· {item.bodyPart}</Text>}
        </View>
        {!!findings && <Text style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginTop: '2px' }}>检查所见：{findings}</Text>}
        {!!item.diagnosis && <Text style={{ fontSize: '11px', color: statusColor, display: 'block', marginTop: '2px' }}>诊断意见：{item.diagnosis}</Text>}
      </View>
    );
  }
  return (
    <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderBottom: `1px solid ${colors.borderLight}` }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: '13px', color: colors.textPrimary, fontWeight: 500, display: 'block' }}>{item.name}</Text>
        {!!item.referenceRange && <Text style={{ fontSize: '11px', color: colors.textMuted }}>参考范围：{item.referenceRange}</Text>}
      </View>
      <View style={{ textAlign: 'right' }}>
        <Text style={{ fontSize: '13px', fontWeight: 700, color: statusColor, display: 'block' }}>{item.value}{item.unit ? ` ${item.unit}` : ''}</Text>
        <Text style={{ fontSize: '10px', color: statusColor }}>{ITEM_STATUS_LABEL[item.status] || ''}</Text>
      </View>
    </View>
  );
}

function ReportCard({ report }) {
  const [expanded, setExpanded] = useState(false);
  const hasItems = report.reportItems?.length > 0;
  const hasAI = !!report.aiSummary;
  const hasFile = !!(report.fileUrl || report.fileUrls?.length || report.hasContent);

  return (
    <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, marginBottom: `${spacing.sm}px`, boxShadow: shadow.xs, overflow: 'hidden' }}>
      <View onClick={() => setExpanded((e) => !e)} style={{ display: 'flex', alignItems: 'flex-start', padding: `${spacing.md}px`, gap: `${spacing.sm}px` }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>{report.title}</Text>
          <View style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
            {(report.checkDate || report.date) && (
              <View style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Icon name="📅" size={11} color={colors.textMuted} />
                <Text style={{ fontSize: '11px', color: colors.textMuted }}>{report.checkDate || report.date}</Text>
              </View>
            )}
            {(report.institution || report.hospital) && (
              <View style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Icon name="🏥" size={11} color={colors.textMuted} />
                <Text style={{ fontSize: '11px', color: colors.textMuted }}>{report.institution || report.hospital}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {report.aiStatus === 'pending' && <Text style={{ fontSize: '10px', color: colors.warning, backgroundColor: '#FEF3E2', borderRadius: `${radius.full}px`, padding: '2px 8px' }}>待审核</Text>}
          {report.aiStatus === 'reviewed' && <Text style={{ fontSize: '14px', color: colors.success }}>✓</Text>}
          <Text style={{ fontSize: '12px', color: colors.textMuted }}>{expanded ? '▲' : '▼'}</Text>
        </View>
      </View>

      {expanded && (
        <View style={{ padding: `${spacing.sm}px ${spacing.md}px ${spacing.md}px`, borderTop: `1px solid ${colors.borderLight}` }}>
          {hasFile && (
            <View onClick={() => openOriginalFile(report)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', border: `1px solid ${colors.primary}`, borderRadius: `${radius.sm}px`, padding: '8px', marginBottom: `${spacing.sm}px` }}>
              <Icon name="📎" size={13} color={colors.primary} />
              <Text style={{ fontSize: '13px', color: colors.primary, fontWeight: 600 }}>查看原始报告文件</Text>
            </View>
          )}
          {hasAI && (
            <View style={{ backgroundColor: '#E8F5EF', borderRadius: `${radius.sm}px`, padding: `${spacing.sm}px`, marginBottom: `${spacing.sm}px` }}>
              <Text style={{ fontSize: '11px', fontWeight: 700, color: colors.primary, display: 'block', marginBottom: '4px' }}>AI 趋势分析{report.aiStatus === 'reviewed' ? '（已审核）' : '（待审核）'}</Text>
              <Text style={{ fontSize: '12px', color: colors.textSecondary, lineHeight: '18px' }}>{report.aiSummary}</Text>
            </View>
          )}
          {hasItems ? (
            <View>
              <Text style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginBottom: `${spacing.xs}px` }}>检查项目（{report.reportItems.length} 项）</Text>
              {report.reportItems.map((item, i) => <ReportItemRow key={i} item={item} />)}
            </View>
          ) : (
            <View style={{ textAlign: 'center', padding: `${spacing.md}px 0` }}>
              <Text style={{ fontSize: '12px', color: colors.textMuted }}>暂无解析数据，请联系健管专员</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

export default function MedicalReportsPage() {
  const { statusBarHeight } = useNavBar();
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selYear, setSelYear] = useState(null);
  const [searchKw, setSearchKw] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reportsAPI.byCategory();
      setYears(res.data || []);
      if (res.data?.length > 0) setSelYear(res.data[0].year);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const currentYear = years.find((y) => y.year === selYear);
  const kw = searchKw.trim();
  const searchResults = kw
    ? years.flatMap((y) => y.categories.flatMap((cat) => cat.reports)).filter((r) => (r.title || '').toLowerCase().includes(kw.toLowerCase()))
    : null;

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, paddingBottom: `${spacing.xxl}px` }}>
      <View style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`,
        backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`,
      }}>
        <View onClick={() => Taro.navigateBack()} style={{ padding: '4px' }}>
          <Icon name="chevron-left" size={20} color={colors.textPrimary} />
        </View>
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>体检报告</Text>
        <View style={{ width: '28px' }} />
      </View>

      {years.length > 0 && (
        <View style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: `${spacing.sm}px ${spacing.lg}px ${spacing.xs}px`, padding: '0 12px', height: '36px', borderRadius: `${radius.full}px`, backgroundColor: '#fff', border: `1px solid ${colors.border}`, boxSizing: 'border-box' }}>
          <Icon name="🔍" size={13} color={colors.textMuted} />
          <Input style={{ flex: 1, fontSize: '13px', color: colors.textPrimary }} placeholder="搜索报告标题" value={searchKw} onInput={(e) => setSearchKw(e.detail.value)} />
          {!!searchKw && <View onClick={() => setSearchKw('')}><Icon name="✕" size={13} color={colors.textMuted} /></View>}
        </View>
      )}

      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted, textAlign: 'center', display: 'block', marginTop: '60px' }}>加载中...</Text>
      ) : years.length === 0 ? (
        <View style={{ textAlign: 'center', padding: `${spacing.xl}px` }}>
          <View style={{ display: 'flex', justifyContent: 'center', marginBottom: `${spacing.sm}px` }}><Icon name="📄" size={48} /></View>
          <Text style={{ fontSize: '16px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>暂无体检报告</Text>
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>上传报告后，将按年度和类目自动归类展示</Text>
        </View>
      ) : searchResults ? (
        <View style={{ padding: `0 ${spacing.lg}px` }}>
          {searchResults.length === 0 ? (
            <View style={{ textAlign: 'center', padding: `${spacing.xl}px` }}>
              <View style={{ display: 'flex', justifyContent: 'center', marginBottom: `${spacing.sm}px` }}><Icon name="🔍" size={48} /></View>
              <Text style={{ fontSize: '13px', color: colors.textMuted }}>没有匹配"{kw}"的报告</Text>
            </View>
          ) : searchResults.map((r) => <ReportCard key={r._id} report={r} />)}
        </View>
      ) : (
        <>
          <ScrollView scrollX style={{ whiteSpace: 'nowrap', padding: `${spacing.sm}px ${spacing.lg}px` }}>
            {years.map((y) => (
              <View key={y.year} onClick={() => setSelYear(y.year)} style={{
                display: 'inline-block', padding: '7px 16px', borderRadius: `${radius.full}px`, marginRight: '8px',
                border: `1.5px solid ${selYear === y.year ? colors.primary : colors.border}`, backgroundColor: selYear === y.year ? colors.primary : '#fff',
              }}>
                <Text style={{ fontSize: '13px', fontWeight: 600, color: selYear === y.year ? '#fff' : colors.textSecondary }}>{y.year} 年</Text>
              </View>
            ))}
          </ScrollView>

          <View style={{ padding: `0 ${spacing.lg}px` }}>
            {currentYear?.categories.map((cat) => {
              const meta = CATEGORY_META[cat.key] || { label: cat.label, icon: '📄', color: colors.primary };
              return (
                <View key={cat.key} style={{ marginBottom: `${spacing.lg}px` }}>
                  <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, marginBottom: `${spacing.sm}px` }}>
                    <View style={{ width: '36px', height: '36px', borderRadius: `${radius.sm}px`, backgroundColor: meta.color + '30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={meta.icon} size={18} color={meta.color} />
                    </View>
                    <Text style={{ fontSize: '14px', fontWeight: 700, color: meta.color, flex: 1 }}>{meta.label}</Text>
                    <Text style={{ fontSize: '12px', color: colors.textMuted }}>{cat.reports.length} 份</Text>
                  </View>
                  {cat.reports.map((r) => <ReportCard key={r._id} report={r} />)}
                </View>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}
