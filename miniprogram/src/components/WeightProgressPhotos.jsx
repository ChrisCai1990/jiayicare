import React, { useEffect, useState } from 'react';
import { View, Text, Image, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { weightProgressPhotosAPI } from '../services/api';
import { chooseImageWithPrivacy, showImagePickerError } from '../utils/imagePicker';

const stages = [['before', '管理前'], ['progress', '阶段记录'], ['after', '管理后']];
const views = [['front', '正面'], ['side', '侧面'], ['back', '背面']];
const today = () => new Date().toLocaleDateString('en-CA');
const actionStyle = { padding: '8px 10px', margin: '4px', borderRadius: '7px', background: '#EAF6F0', color: '#1E6B50', display: 'inline-block' };

export default function WeightProgressPhotos() {
  const [open, setOpen] = useState(false), [rows, setRows] = useState([]), [plans, setPlans] = useState([]), [planId, setPlanId] = useState(''), [error, setError] = useState('');
  const [stage, setStage] = useState('before'), [view, setView] = useState('front'), [takenOn, setTakenOn] = useState(today());
  const [path, setPath] = useState(''), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false);
  const [leftId, setLeftId] = useState(''), [rightId, setRightId] = useState('');
  const load = async () => { try { const result = await weightProgressPhotosAPI.list(); setRows(result.data || []); setError(''); } catch (e) { setError(e.message || '照片加载失败'); } };
  useEffect(() => { if (open) { load(); weightProgressPhotosAPI.plans().then(result => setPlans(result.data || [])).catch(() => {}); } }, [open]);
  const pick = async () => { try { const result = await chooseImageWithPrivacy({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] }); setPath(result.tempFilePaths?.[0] || ''); } catch (e) { showImagePickerError(e); } };
  const save = async () => {
    if (!path || !consent || busy) return;
    setBusy(true); setError('');
    try {
      const content = Taro.getFileSystemManager().readFileSync(path, 'base64');
      const ext = path.split('.').pop()?.toLowerCase();
      const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ['heic', 'heif'].includes(ext) ? 'image/heic' : 'image/jpeg';
      await weightProgressPhotosAPI.add({ content, mimeType, planId, stage, view, takenOn, consentConfirmed: 'true' });
      setPath(''); setConsent(false); await load();
    } catch (e) { setError(e.message || '保存失败'); } finally { setBusy(false); }
  };
  const remove = async row => { const result = await Taro.showModal({ title: '移除照片', content: '确认移除这张照片？' }); if (!result.confirm) return;
    try { await weightProgressPhotosAPI.remove(row.id); await load(); } catch (e) { setError(e.message || '移除失败'); } };
  const chosen = id => rows.find(row => row.id === id);
  return <View style={{ background: '#fff', borderRadius: '12px', padding: '14px', marginBottom: '14px' }}>
    <View onClick={() => setOpen(!open)}><Text style={{ fontWeight: 700, fontSize: '16px' }}>体型照片 {open ? '收起' : '查看与存档 ›'}</Text></View>
    {open && <>
      <Text style={{ display: 'block', color: '#687A70', fontSize: '12px', marginTop: '6px' }}>仅供本人和负责医护进行健康管理对比，不自动判断效果。</Text>
      {!!error && <Text style={{ display: 'block', color: '#B42318', marginTop: '8px' }}>{error}</Text>}
      <View style={{ marginTop: '12px' }}>所属营养方案 <Picker range={['暂不关联', ...plans.map(plan => plan.title)]} value={Math.max(0, plans.findIndex(plan => plan._id === planId) + 1)} onChange={e => setPlanId(plans[Number(e.detail.value) - 1]?._id || '')}><Text style={actionStyle}>{plans.find(plan => plan._id === planId)?.title || '暂不关联'} ▾</Text></Picker></View>
      <View style={{ marginTop: '12px' }}>阶段 <Picker range={stages.map(item => item[1])} value={Math.max(0, stages.findIndex(item => item[0] === stage))} onChange={e => setStage(stages[Number(e.detail.value)][0])}><Text style={actionStyle}>{stages.find(item => item[0] === stage)?.[1]} ▾</Text></Picker></View>
      <View>角度 <Picker range={views.map(item => item[1])} value={Math.max(0, views.findIndex(item => item[0] === view))} onChange={e => setView(views[Number(e.detail.value)][0])}><Text style={actionStyle}>{views.find(item => item[0] === view)?.[1]} ▾</Text></Picker></View>
      <View>拍摄日期 <Picker mode="date" end={today()} value={takenOn} onChange={e => setTakenOn(e.detail.value)}><Text style={actionStyle}>{takenOn} ▾</Text></Picker></View>
      <View onClick={pick}><Text style={actionStyle}>{path ? '已选择照片，重新选择' : '选择照片'}</Text></View>
      {!!path && <Image src={path} style={{ width: '90px', height: '110px' }} mode="aspectFill" />}
      <View onClick={() => setConsent(!consent)}><Text style={actionStyle}>{consent ? '☑' : '□'} 我同意存档体型照片用于健康管理对比</Text></View>
      <View onClick={save}><Text style={{ ...actionStyle, opacity: !path || !consent || busy ? 0.5 : 1 }}>{busy ? '保存中…' : '保存照片'}</Text></View>
      <Text style={{ display: 'block', fontWeight: 700, marginTop: '14px' }}>历史照片</Text>
      {!rows.length && <Text style={{ color: '#789087' }}>暂无照片</Text>}
      <View style={{ display: 'flex', flexWrap: 'wrap' }}>{rows.map(row => <View key={row.id} style={{ width: '108px', margin: '5px' }}>
        <Image src={row.url} style={{ width: '100px', height: '110px' }} mode="aspectFill" />
        <Text style={{ display: 'block', fontSize: '11px' }}>{row.takenOn} · {stages.find(item => item[0] === row.stage)?.[1]} · {views.find(item => item[0] === row.view)?.[1]} · {plans.find(plan => plan._id === row.planId)?.title || '未关联方案'}</Text>
        <View onClick={() => setLeftId(row.id)}><Text style={actionStyle}>{leftId === row.id ? '✓' : ''}左侧</Text></View>
        <View onClick={() => setRightId(row.id)}><Text style={actionStyle}>{rightId === row.id ? '✓' : ''}右侧</Text></View>
        {row.uploadedByType === 'patient' && <View onClick={() => remove(row)}><Text style={actionStyle}>移除</Text></View>}
      </View>)}</View>
      {(chosen(leftId) || chosen(rightId)) && <View style={{ display: 'flex', gap: '8px' }}>{[chosen(leftId), chosen(rightId)].map((row, index) => <View key={index} style={{ width: '48%' }}>{row && <><Image src={row.url} mode="aspectFit" style={{ width: '100%', height: '180px' }} /><Text>{row.takenOn}</Text></>}</View>)}</View>}
    </>}
  </View>;
}
