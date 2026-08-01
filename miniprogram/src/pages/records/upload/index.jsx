import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { reportsAPI, mediaUrl } from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';

// 用 Taro.chooseImage + Taro.uploadFile 对接后端 POST /reports 接口
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
      const fs = Taro.getFileSystemManager();
      const contents = filePaths.map((filePath) => {
        const base64 = fs.readFileSync(filePath, 'base64');
        const extension = (filePath.split('.').pop() || 'jpg').toLowerCase();
        const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
        return `data:${mimeType};base64,${base64}`;
      });
      const createRes = await reportsAPI.create({
        title: `体检报告 ${new Date().toLocaleDateString('zh-CN')}`,
        category: '',
        contents,
        pages: contents.length,
      });
      if (createRes.success) {
        Taro.showToast({ title: '上传成功，等待AI解析', icon: 'success' });
        load();
      } else {
        Taro.showToast({ title: createRes.message || '上传失败', icon: 'none' });
      }
    } catch (err) {
      if (err.errMsg && /cancel/i.test(err.errMsg)) return;
      Taro.showToast({ title: err.message || '上传失败', icon: 'none' });
    } finally {
      setUploading(false);
    }
  };

  const STATUS_LABEL = {
    pending: '待解析', parsing: '解析中', parsed: '待审核', approved: '已通过', rejected: '需重传',
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, padding: `${statusBarHeight + 12}px ${spacing.lg}px ${spacing.lg}px` }}>
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
  );
}
