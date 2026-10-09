import React, { useEffect, useState } from 'react';
import { Canvas, Input, Picker, ScrollView, Text, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { ibdAPI, reportsAPI } from '../../../services/api';
import { colors, radius, spacing } from '../../../theme';
import useNavBar from '../../../hooks/useNavBar';
import { chooseImageWithPrivacy, isImagePickerCancelled, isPrivacyDeclarationMissing, showImagePickerError } from '../../../utils/imagePicker';

const chartId = 'ibd-fc-trend';
const dateMs = value => Date.parse(`${value}T12:00:00+08:00`);
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function FcChart({ rows, days }) {
  const width = Math.max(280, Math.min(380, Taro.getSystemInfoSync().windowWidth - 56));
  const end = dateMs(today());
  const start = end - days * 86400000;
  const points = rows.filter(row => Number.isFinite(Number(row.value)) && Number.isFinite(dateMs(row.date)) && dateMs(row.date) >= start && dateMs(row.date) <= end)
    .sort((a, b) => a.date.localeCompare(b.date));

  useEffect(() => {
    if (!points.length) return;
    const ctx = Taro.createCanvasContext(chartId);
    const left = 32, right = width - 13, top = 17, bottom = 143;
    const max = Math.max(1, ...points.map(row => Number(row.value))) * 1.12;
    const x = row => left + ((dateMs(row.date) - start) / (end - start)) * (right - left);
    const y = row => bottom - Number(row.value) / max * (bottom - top);
    ctx.setStrokeStyle('#DCE9E3'); ctx.setLineWidth(1); ctx.beginPath();
    ctx.moveTo(left, top); ctx.lineTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
    ctx.setFontSize(10); ctx.setFillStyle(colors.textMuted);
    ctx.fillText('0', 11, bottom + 3); ctx.fillText(String(Math.ceil(max)), 1, top + 4);
    ctx.setStrokeStyle('#0E7490'); ctx.setLineWidth(2.5);
    points.slice(1).forEach((row, index) => {
      const previous = points[index];
      if ((dateMs(row.date) - dateMs(previous.date)) / 86400000 > 120) return;
      ctx.beginPath(); ctx.moveTo(x(previous), y(previous)); ctx.lineTo(x(row), y(row)); ctx.stroke();
    });
    points.forEach(row => {
      ctx.beginPath(); ctx.setFillStyle(row.verified ? '#0E7490' : '#FFFFFF');
      ctx.setStrokeStyle('#0E7490'); ctx.setLineWidth(2);
      ctx.arc(x(row), y(row), 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });
    ctx.draw();
  }, [rows, days, width]);

  if (!points.length) return <Text style={{ display: 'block', textAlign: 'center', padding: '38px 0', color: colors.textMuted }}>近{days}天暂无 FC 检测记录</Text>;
  return <View>
    <Canvas canvasId={chartId} id={chartId} style={{ width: `${width}px`, height: '160px', display: 'block' }} />
    <View style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}><Text style={{ fontSize: '11px', color: colors.textMuted }}>{new Date(start).toLocaleDateString('zh-CN')}</Text><Text style={{ fontSize: '11px', color: colors.textMuted }}>{today()}</Text></View>
    <Text style={{ display: 'block', fontSize: '11px', color: colors.textMuted, marginTop: '8px' }}>● 已审核报告　○ 客户录入待核验；间隔超过 120 天的检测点不连线</Text>
  </View>;
}

export default function IbdFcPage() {
  const { statusBarHeight } = useNavBar();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [days, setDays] = useState(365);
  const [date, setDate] = useState(today());
  const [value, setValue] = useState('');
  const [institution, setInstitution] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reportId, setReportId] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const load = async () => {
    try { const res = await ibdAPI.overview(365); setData(res.data); setError(''); }
    catch (err) { setError(err.message || '加载失败'); }
  };
  useDidShow(() => { load(); });
  const save = async () => {
    if (!date || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) {
      Taro.showToast({ title: '请填写采样日期和 FC 数值', icon: 'none' }); return;
    }
    setSaving(true);
    try {
      await ibdAPI.addFc({ date, value, institution: institution.trim(), reportId });
      setValue(''); setInstitution(''); setReportId(''); setUploadMessage(''); await load();
      Taro.showToast({ title: '已保存，待核验', icon: 'success' });
    } catch (err) { Taro.showToast({ title: err.message || '保存失败', icon: 'none' }); }
    finally { setSaving(false); }
  };
  const uploadReport = async () => {
    if (uploading || saving) return;
    setUploading(true); setUploadMessage('');
    try {
      const selected = await chooseImageWithPrivacy({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const filePath = selected.tempFilePaths?.[0];
      if (!filePath) return;
      const ext = (filePath.split('.').pop() || 'jpg').toLowerCase();
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : (ext === 'heic' || ext === 'heif') ? 'image/heic' : 'image/jpeg';
      const base64 = Taro.getFileSystemManager().readFileSync(filePath, 'base64');
      setUploadMessage('正在上传报告…');
      const uploaded = await reportsAPI.uploadBase64(`data:${mimeType};base64,${base64}`, mimeType);
      if (!uploaded?.data?.fileUrl) throw new Error('报告上传未完成');
      const created = await reportsAPI.create({
        title: `IBD 粪便钙卫蛋白检验报告 ${today()}`, type: 'other',
        fileUrl: uploaded.data.fileUrl, fileUrls: [uploaded.data.fileUrl], ossKeys: [uploaded.data.ossKey],
        mimeType: uploaded.data.mimeType || mimeType, pages: 1, fileSize: uploaded.data.fileSize || 0,
      });
      if (!created?.data?._id) throw new Error('报告存档未完成');
      setReportId(created.data._id);
      setUploadMessage('报告已保存，正在识别…');
      const recognized = await ibdAPI.recognizeFc(created.data._id);
      const result = recognized?.data || {};
      if (result.date) setDate(result.date);
      if (result.value !== '') setValue(String(result.value));
      if (result.institution) setInstitution(result.institution);
      setUploadMessage(result.recognized ? '已提取候选结果，请核对报告后保存。' : '未识别到明确的 FC 数值，请依据报告手工填写。');
    } catch (err) {
      if (isImagePickerCancelled(err)) return;
      if (isPrivacyDeclarationMissing(err)) { showImagePickerError(err); return; }
      setUploadMessage(err.message || '上传或识别失败，请重试');
    } finally { setUploading(false); }
  };
  const remove = async row => {
    const confirmed = await Taro.showModal({ title: '撤回自录结果', content: `撤回 ${row.date} 的 FC 记录？` });
    if (!confirmed.confirm) return;
    try { await ibdAPI.deleteFc(row.id); await load(); }
    catch (err) { Taro.showToast({ title: err.message || '撤回失败', icon: 'none' }); }
  };
  const rows = data?.fc || [];
  const latest = rows[rows.length - 1];
  const card = { backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: '16px', marginBottom: `${spacing.md}px` };
  const field = { border: `1px solid ${colors.border}`, borderRadius: '8px', padding: '10px', marginTop: '6px', marginBottom: '12px', fontSize: '14px' };
  const inputField = { border: `1px solid ${colors.border}`, borderRadius: '8px', boxSizing: 'border-box', height: '44px', lineHeight: '44px', padding: '0 12px', marginTop: '6px', marginBottom: '12px', fontSize: '14px' };
  return <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
    <View style={{ padding: `${statusBarHeight + 12}px 16px 12px`, backgroundColor: '#fff', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <Text onClick={() => Taro.navigateBack()} style={{ fontSize: '20px', color: colors.primary }}>‹</Text>
      <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>IBD · 粪便钙卫蛋白</Text>
    </View>
    <ScrollView scrollY style={{ height: `calc(100vh - ${statusBarHeight + 62}px)` }}>
      <View style={{ padding: '16px' }}>
        {!!error && <Text onClick={load} style={{ display: 'block', color: colors.danger, marginBottom: '12px' }}>{error} · 点击重试</Text>}
        {!data ? <Text style={{ color: colors.textSecondary }}>正在加载 FC 数据…</Text> : !data.enabled ? <View style={card}><Text style={{ color: colors.textSecondary }}>开通 IBD 专病管理服务后，可在这里查看 FC 趋势。</Text></View> : <>
          <View style={card}>
            <Text style={{ display: 'block', fontSize: '16px', fontWeight: 700, color: colors.textPrimary }}>FC 检测趋势</Text>
            <Text style={{ display: 'block', color: colors.textSecondary, fontSize: '12px', marginTop: '5px' }}>单位：μg/g；按采样日期绘制，检测频次由专科方案确定。</Text>
            <View style={{ display: 'flex', gap: '8px', margin: '12px 0' }}>{[[90, '近 90 天'], [365, '近 1 年']].map(([count, label]) => <Text key={count} onClick={() => setDays(count)} style={{ padding: '7px 12px', borderRadius: '15px', backgroundColor: days === count ? colors.primary : colors.background, color: days === count ? '#fff' : colors.textSecondary }}>{label}</Text>)}</View>
            <FcChart rows={rows} days={days} />
            {latest && <Text style={{ display: 'block', color: colors.primary, fontSize: '14px', marginTop: '12px' }}>最近一次：{latest.date} · {latest.value} μg/g</Text>}
          </View>
          {data.canRecord && <View style={card}>
            <Text style={{ display: 'block', fontSize: '16px', fontWeight: 700, color: colors.textPrimary, marginBottom: '6px' }}>录入 FC 结果</Text>
            <Text style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '12px' }}>请依据检验报告填写；客户录入结果标记为待核验。</Text>
            <View onClick={uploading ? undefined : uploadReport} style={{ border: `1px solid ${colors.primary}`, borderRadius: '9px', padding: '12px', textAlign: 'center', marginBottom: '8px', opacity: uploading ? 0.6 : 1 }}><Text style={{ color: colors.primary, fontWeight: 700 }}>{uploading ? '报告处理中…' : '上传 FC 检验报告并识别'}</Text></View>
            {!!uploadMessage && <Text style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '12px' }}>{uploadMessage}</Text>}
            <Text style={{ color: colors.textPrimary }}>采样日期</Text><Picker mode="date" value={date} end={today()} onChange={event => setDate(event.detail.value)}><View style={field}>{date}</View></Picker>
            <Text style={{ color: colors.textPrimary }}>FC 数值（μg/g）</Text><Input type="digit" value={value} onInput={event => setValue(event.detail.value)} style={inputField} placeholder="填写报告上的数值" />
            <Text style={{ color: colors.textPrimary }}>检测机构（选填）</Text><Input value={institution} onInput={event => setInstitution(event.detail.value)} style={inputField} placeholder="例如医院或检验机构" />
            <View onClick={saving ? undefined : save} style={{ backgroundColor: colors.primary, borderRadius: '9px', padding: '12px', textAlign: 'center', opacity: saving ? 0.6 : 1 }}><Text style={{ color: '#fff', fontWeight: 700 }}>{saving ? '保存中…' : '保存 FC 结果'}</Text></View>
          </View>}
          <View style={card}>
            <Text style={{ display: 'block', fontSize: '16px', fontWeight: 700, color: colors.textPrimary, marginBottom: '8px' }}>检测记录</Text>
            {!rows.length ? <Text style={{ color: colors.textMuted }}>暂无检测记录</Text> : rows.slice().reverse().map(row => <View key={row.id} style={{ borderTop: `1px solid ${colors.border}`, padding: '10px 0' }}>
              <Text style={{ display: 'block', color: colors.textPrimary }}>{row.date}　{row.value} μg/g</Text>
              <View style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}><Text style={{ color: colors.textMuted, fontSize: '11px' }}>{row.source}{row.institution ? ` · ${row.institution}` : ''}{row.verified ? '' : ' · 待核验'}</Text>{!row.verified && <Text onClick={() => remove(row)} style={{ color: colors.danger, fontSize: '11px' }}>撤回</Text>}</View>
            </View>)}
          </View>
          <Text style={{ display: 'block', fontSize: '11px', color: colors.textSecondary, lineHeight: '18px' }}>FC 曲线仅辅助客户与健康顾问、专科医师回顾病情；不根据单次数值自动判断复发或调整治疗。</Text>
        </>}
      </View>
    </ScrollView>
  </View>;
}
