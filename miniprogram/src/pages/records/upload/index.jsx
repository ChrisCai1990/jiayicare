import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { reportsAPI, mediaUrl } from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';

// 逐张读取压缩图并通过普通 HTTPS 请求上传，避免 uploadFile 域名配置导致真机端请求未到后端。
export default function ReportUploadPage() {
  const { statusBarHeight } = useNavBar();
  const [reports, setReports] = useState([]);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    reportsAPI.list().then((res) => { if (res.success) setReports(res.data || []); }).catch(() => {});
  }, []);

  useDidShow(() => { load(); });

  const pickAndUpload = async () => {
    try {
      const res = await Taro.chooseImage({ count: 9, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const filePaths = res.tempFilePaths || [];
      if (!filePaths.length) return;
      setUploading(true);
      const uploadedFiles = [];
      for (const filePath of filePaths) {
        const base64 = Taro.getFileSystemManager().readFileSync(filePath, 'base64');
        const ext = (filePath.split('.').pop() || 'jpg').toLowerCase();
        const mimeType = ext === 'png' ? 'image/png'
          : ext === 'webp' ? 'image/webp'
          : (ext === 'heic' || ext === 'heif') ? 'image/heic'
          : 'image/jpeg';
        uploadedFiles.push((await reportsAPI.uploadBase64(`data:${mimeType};base64,${base64}`, mimeType)).data);
      }
      const createRes = await reportsAPI.create({
        title: `体检报告 ${new Date().getFullYear()}年${new Date().getMonth() + 1}月${new Date().getDate()}日`,
        category: '',
        fileUrl: uploadedFiles[0]?.fileUrl || '',
        fileUrls: uploadedFiles.map((item) => item.fileUrl).filter(Boolean),
        ossKeys: uploadedFiles.map((item) => item.ossKey).filter(Boolean),
        mimeType: uploadedFiles[0]?.mimeType || 'image/jpeg',
        pages: uploadedFiles.length,
        fileSize: uploadedFiles.reduce((sum, item) => sum + (Number(item.fileSize) || 0), 0),
      });
      if (createRes.success) {
        Taro.showToast({ title: '上传成功，等待AI解析', icon: 'success' });
        load();
      } else {
        Taro.showToast({ title: createRes.message || '上传失败', icon: 'none' });
      }
    } catch (err) {
      if (err.errMsg && /cancel/i.test(err.errMsg)) return;
      console.error('[report-upload]', err);
      Taro.showModal({ title: '上传失败', content: err.message || err.errMsg || '网络异常，请稍后重试', showCancel: false });
    } finally {
      setUploading(false);
    }
  };

  const STATUS_LABEL = {
    none: '待解析', processing: '解析中', pending: '待审核', reviewed: '已审核', rejected: '需重传',
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`, backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}` }}>
        <View onClick={() => Taro.navigateBack({ fail: () => Taro.switchTab({ url: '/pages/records/index/index' }) })} style={{ padding: '4px' }}>
          <Icon name="chevron-left" size={20} color={colors.textPrimary} />
        </View>
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>上传体检/检查报告</Text>
        <View style={{ width: '28px' }} />
      </View>
      <View style={{ padding: `${spacing.lg}px` }}>
      <View
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          backgroundColor: colors.primary, borderRadius: `${radius.md}px`, padding: '16px 0', marginBottom: `${spacing.lg}px`,
        }}
        onClick={pickAndUpload}
      >
        <Text style={{ color: '#fff', fontSize: '15px', fontWeight: 700 }}>{uploading ? '上传中...' : '📷 拍照/选图上传体检报告'}</Text>
      </View>

      <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.textMuted, marginBottom: `${spacing.sm}px`, display: 'block' }}>已上传报告</Text>
      {reports.length === 0 ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无报告</Text>
      ) : (
        reports.map((r) => (
          <View key={r._id} style={{
            display: 'flex', alignItems: 'center', backgroundColor: '#fff', borderRadius: `${radius.md}px`,
            padding: `${spacing.md}px`, marginBottom: '8px', boxShadow: shadow.card,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>{r.title || '体检报告'}</Text>
              <Text style={{ fontSize: '11px', color: colors.textMuted }}>{r.category || '未分类'}</Text>
            </View>
            <Text style={{ fontSize: '12px', color: colors.primary, fontWeight: 600 }}>{STATUS_LABEL[r.aiStatus || r.status] || '待解析'}</Text>
          </View>
        ))
      )}
      </View>
    </View>
  );
}
