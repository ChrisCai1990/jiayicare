import React, { useState, useRef, useCallback } from 'react';
import { View, Text, Button } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { reportsAPI, mediaUrl } from '../../../services/api';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';
import { chooseImageWithPrivacy, isImagePickerCancelled, isPrivacyDeclarationMissing, showImagePickerError } from '../../../utils/imagePicker';

// 逐张读取压缩图并通过普通 HTTPS 请求上传，避免 uploadFile 域名配置导致真机端请求未到后端。
export default function ReportUploadPage() {
  const { statusBarHeight } = useNavBar();
  const [reports, setReports] = useState([]);
  const [uploading, setUploading] = useState(false);
  const uploadLock = useRef(false);
  const listRequest = useRef(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0, stage: '' });

  const load = useCallback(async () => {
    const id = ++listRequest.current;
    setListLoading(true);
    try {
      const res = await reportsAPI.list();
      if (!res?.success || !Array.isArray(res.data)) throw new Error('报告列表暂未加载');
      if (id !== listRequest.current) return;
      setReports(res.data); setListError('');
    } catch (error) {
      if (id === listRequest.current) setListError(error.message || '报告列表暂未加载');
    } finally { if (id === listRequest.current) setListLoading(false); }
  }, []);

  useDidShow(() => { load(); });

  const pickAndUpload = async () => {
    if (uploadLock.current) return;
    uploadLock.current = true;
    setUploading(true);
    setUploadError('');
    setProgress({ done: 0, total: 0, stage: '选择报告图片' });
    let saving = false;
    try {
      const res = await chooseImageWithPrivacy({ count: 9, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const filePaths = res.tempFilePaths || [];
      if (!filePaths.length) { setProgress({ done: 0, total: 0, stage: '' }); return; }
      setProgress({ done: 0, total: filePaths.length, stage: '正在上传' });
      const uploadedFiles = [];
      for (const filePath of filePaths) {
        const base64 = Taro.getFileSystemManager().readFileSync(filePath, 'base64');
        const ext = (filePath.split('.').pop() || 'jpg').toLowerCase();
        const mimeType = ext === 'png' ? 'image/png'
          : ext === 'webp' ? 'image/webp'
          : (ext === 'heic' || ext === 'heif') ? 'image/heic'
          : 'image/jpeg';
        const uploaded = await reportsAPI.uploadBase64(`data:${mimeType};base64,${base64}`, mimeType);
        if (!uploaded?.success || !uploaded.data?.fileUrl) throw new Error(uploaded?.message || '图片上传未完成');
        uploadedFiles.push(uploaded.data);
        setProgress({ done: uploadedFiles.length, total: filePaths.length, stage: '正在上传' });
      }
      saving = true;
      setProgress({ done: uploadedFiles.length, total: filePaths.length, stage: '图片上传完成，正在保存报告' });
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
        setProgress({ done: uploadedFiles.length, total: filePaths.length, stage: '报告已提交，等待服务团队处理' });
        Taro.showToast({ title: '报告已提交', icon: 'success' });
        load();
      } else {
        throw new Error(createRes.message || '报告未保存成功');
      }
    } catch (err) {
      if (isImagePickerCancelled(err)) { setProgress({ done: 0, total: 0, stage: '' }); return; }
      console.error('[report-upload]', err);
      setProgress(previous => ({ ...previous, stage: '' }));
      setUploadError(saving ? '报告保存结果尚未确认，请先刷新下方列表核对，避免重复上传。' : (err.message || err.errMsg || '上传未完成，请重试'));
      if (isPrivacyDeclarationMissing(err)) {
        showImagePickerError(err);
        return;
      }
      Taro.showModal({ title: '上传失败', content: err.message || err.errMsg || '网络异常，请稍后重试', showCancel: false });
    } finally {
      uploadLock.current = false;
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
      <Button disabled={uploading}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          backgroundColor: colors.primary, borderRadius: `${radius.md}px`, padding: '16px 0', marginBottom: `${spacing.lg}px`,
        }}
        onClick={pickAndUpload}
      >
        <Text style={{ color: '#fff', fontSize: '15px', fontWeight: 700 }}>{uploading ? (progress.total ? `已上传 ${progress.done}/${progress.total} 页` : '正在选择图片…') : '📷 拍照/选图上传体检报告'}</Text>
      </Button>
      {!!progress.stage && <View style={{marginBottom:'16px'}}><Text style={{fontSize:'13px',color:colors.textSecondary}}>{progress.stage}</Text>{progress.total > 0 && <View style={{height:'5px',backgroundColor:colors.border,borderRadius:'4px',marginTop:'8px'}}><View style={{height:'5px',width:`${progress.done/progress.total*100}%`,backgroundColor:colors.primary,borderRadius:'4px'}}/></View>}</View>}
      {!!uploadError && <View style={{marginBottom:'16px'}}><Text style={{fontSize:'13px',color:colors.danger,display:'block'}}>{uploadError}</Text><Text onClick={load} style={{fontSize:'13px',color:colors.primary,display:'block',padding:'10px 0'}}>刷新报告列表</Text></View>}

      <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.textMuted, marginBottom: `${spacing.sm}px`, display: 'block' }}>已上传报告</Text>
      {!!listError && <Text onClick={load} style={{display:'block',fontSize:'13px',color:colors.danger,padding:'12px 0'}}>{listError} · 点击重试</Text>}
      {listLoading && reports.length === 0 ? <Text style={{fontSize:'13px',color:colors.textSecondary}}>报告加载中…</Text> : reports.length === 0 ? (listError ? null : (
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无报告</Text>
      )) : (
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
