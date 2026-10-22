import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { weightProgressPhotosAPI } from '../services/api';

const stages = { before: '管理前', progress: '阶段记录', after: '管理后' };
const views = { front: '正面', side: '侧面', back: '背面' };
const localDay = () => new Date().toLocaleDateString('en-CA');

export default function WeightProgressPhotos() {
  const [open, setOpen] = useState(false), [rows, setRows] = useState([]), [plans, setPlans] = useState([]), [planId, setPlanId] = useState(''), [error, setError] = useState('');
  const [stage, setStage] = useState('before'), [view, setView] = useState('front'), [takenOn, setTakenOn] = useState(localDay());
  const [image, setImage] = useState(null), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false);
  const [leftId, setLeftId] = useState(''), [rightId, setRightId] = useState('');
  const load = async () => { try { const result = await weightProgressPhotosAPI.list(); setRows(result.data || []); setError(''); } catch (e) { setError(e.message || '照片加载失败'); } };
  useEffect(() => { if (open) { load(); weightProgressPhotosAPI.plans().then(result => setPlans(result.data || [])).catch(() => {}); } }, [open]);
  const pick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('需要相册权限', '请允许选择体型照片。');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, base64: true });
    if (!result.canceled && result.assets?.[0]) setImage(result.assets[0]);
  };
  const save = async () => {
    if (!image?.base64 || !consent) return;
    setBusy(true); setError('');
    try {
      await weightProgressPhotosAPI.add({ content: image.base64, mimeType: image.mimeType || 'image/jpeg', planId, stage, view, takenOn, consentConfirmed: 'true' });
      setImage(null); setConsent(false); await load();
    } catch (e) { setError(e.message || '保存失败'); } finally { setBusy(false); }
  };
  const remove = row => Alert.alert('移除照片', '确认移除这张照片？', [{ text: '取消' }, { text: '移除', style: 'destructive', onPress: async () => {
    try { await weightProgressPhotosAPI.remove(row.id); await load(); } catch (e) { setError(e.message || '移除失败'); }
  } }]);
  const button = (label, selected, onPress) => <TouchableOpacity onPress={onPress} style={{ padding: 8, margin: 3, borderRadius: 7, backgroundColor: selected ? '#DDF3E7' : '#F2F5F3' }}><Text>{label}</Text></TouchableOpacity>;
  const chosen = id => rows.find(row => row.id === id);
  return <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 14 }}>
    <TouchableOpacity onPress={() => setOpen(!open)}><Text style={{ fontWeight: '700', fontSize: 16 }}>体型照片 {open ? '收起' : '查看与存档 ›'}</Text></TouchableOpacity>
    {open && <>
      <Text style={{ color: '#687A70', marginTop: 6 }}>仅供本人和负责医护进行健康管理对比，不自动判断效果。</Text>
      {!!error && <Text style={{ color: '#B42318', marginTop: 8 }}>{error}</Text>}
      <Text style={{ marginTop: 12 }}>所属营养方案</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{button('暂不关联', !planId, () => setPlanId(''))}{plans.map(plan => <React.Fragment key={plan._id}>{button(plan.title, planId === plan._id, () => setPlanId(plan._id))}</React.Fragment>)}</View>
      <Text style={{ marginTop: 12 }}>阶段</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{Object.entries(stages).map(([key, label]) => <React.Fragment key={key}>{button(label, stage === key, () => setStage(key))}</React.Fragment>)}</View>
      <Text>角度</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{Object.entries(views).map(([key, label]) => <React.Fragment key={key}>{button(label, view === key, () => setView(key))}</React.Fragment>)}</View>
      <Text>拍摄日期（YYYY-MM-DD）</Text><TextInput value={takenOn} onChangeText={setTakenOn} placeholder="2026-10-22" style={{ borderWidth: 1, borderColor: '#D6E2DB', padding: 8, borderRadius: 7, marginVertical: 6 }} />
      {button(image ? '已选择照片，重新选择' : '从相册选择照片', false, pick)}
      {image && <Image source={{ uri: image.uri }} style={{ width: 90, height: 110, marginVertical: 8 }} />}
      {button(`${consent ? '☑' : '□'} 我同意存档体型照片用于健康管理对比`, consent, () => setConsent(!consent))}
      {button(busy ? '保存中…' : '保存照片', false, save)}
      <Text style={{ fontWeight: '700', marginTop: 15 }}>历史照片</Text>
      {rows.length === 0 && <Text style={{ color: '#789087', marginTop: 5 }}>暂无照片</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{rows.map(row => <View key={row.id} style={{ width: 110, margin: 5 }}>
        <Image source={{ uri: row.url }} style={{ width: 100, height: 110, borderRadius: 6 }} /><Text style={{ fontSize: 12 }}>{row.takenOn}{'\n'}{stages[row.stage]} · {views[row.view]}{'\n'}{plans.find(plan => plan._id === row.planId)?.title || '未关联方案'}</Text>
        {button('设为左侧', leftId === row.id, () => setLeftId(row.id))}{button('设为右侧', rightId === row.id, () => setRightId(row.id))}{row.uploadedByType === 'patient' && button('移除', false, () => remove(row))}
      </View>)}</View>
      {(chosen(leftId) || chosen(rightId)) && <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>{[chosen(leftId), chosen(rightId)].map((row, index) => <View key={index} style={{ flex: 1 }}>{row && <><Image source={{ uri: row.url }} style={{ width: '100%', height: 180 }} resizeMode="contain" /><Text>{row.takenOn}</Text></>}</View>)}</View>}
    </>}
  </View>;
}
