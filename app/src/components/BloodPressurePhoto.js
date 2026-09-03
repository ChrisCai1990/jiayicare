import React, { useRef, useState } from 'react';
import { View, Text, Image, TextInput, TouchableOpacity, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { recordsAPI } from '../services/api';

const field = { backgroundColor: '#fff', padding: 10, marginVertical: 6, borderWidth: 1, borderColor: '#cedbd3', borderRadius: 6 };
const button = { backgroundColor: '#1E6B50', padding: 12, borderRadius: 8, marginVertical: 8 };
function nowText() {
  const d = new Date(Date.now() + 8 * 3600000);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}
async function pickPhoto(camera) {
  if (Platform.OS === 'web') return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/jpeg,image/png,image/webp';
    input.style.display = 'none';
    document.body.appendChild(input);
    const finish = value => { input.remove(); resolve(value); };
    const fail = error => { input.remove(); reject(error); };
    if (camera) input.setAttribute('capture', 'environment');
    input.oncancel = () => finish(null);
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      if (file.size > 6 * 1024 * 1024) return fail(new Error('图片超过6MB，请压缩后上传'));
      const reader = new FileReader();
      reader.onload = () => finish(String(reader.result));
      reader.onerror = () => fail(new Error('图片读取失败'));
      reader.readAsDataURL(file);
    };
    input.click();
  });
  const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('请允许相机或相册权限，或使用手工录入');
  const result = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ mediaTypes: ['images'], base64: true, quality: 0.8 });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset.base64) throw new Error('无法读取照片');
  return 'data:' + (asset.mimeType || 'image/jpeg') + ';base64,' + asset.base64;
}
export default function BloodPressurePhoto({ onSaved }) {
  const [image, setImage] = useState('');
  const [draft, setDraft] = useState(null);
  const [values, setValues] = useState({});
  const [when, setWhen] = useState(nowText);
  const [confirmed, setConfirmed] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const choose = async camera => {
    if (lock.current) return;
    if (!agreed) { setError('请先勾选同意识别所选图片'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const photo = await pickPhoto(camera);
      if (!photo) return;
      setImage(photo); setDraft(null); setValues({}); setConfirmed(false); setWhen(nowText());
      const result = await recordsAPI.recognizeBloodPressure(photo);
      setDraft(result.data);
      setValues(Object.fromEntries(['sys', 'dia', 'pulse'].map(k => [k, result.data[k] == null ? '' : String(result.data[k])])));
    } catch (err) { setError(err.message || '识别失败，请重试或手工录入'); }
    finally { lock.current = false; setBusy(false); }
  };
  const submit = async () => {
    if (lock.current || !draft) return;
    if (!confirmed) { setError('请先确认原图、数值和测量时间无误'); return; }
    if (!/^\d+$/.test(values.sys || '') || !/^\d+$/.test(values.dia || '') || (values.pulse && !/^\d+$/.test(values.pulse))) { setError('请填写完整的整数读数，脉搏可留空'); return; }
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(when)) { setError('时间格式应为 YYYY-MM-DD HH:mm'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      await recordsAPI.create({
        type: 'bloodPressure', category: 'vitals', label: '血压', unit: 'mmHg',
        value: Number(values.sys) + '/' + Number(values.dia),
        extra: { sys: Number(values.sys), dia: Number(values.dia), pulse: values.pulse ? Number(values.pulse) : null },
        recordedAt: when.replace(' ', 'T') + ':00+08:00', imageUrl: image,
        photoRecognition: { token: draft.token, confirmed: true },
      });
      setImage(''); setDraft(null); setConfirmed(false); onSaved?.();
    } catch (err) { setError(err.message || '保存失败，请重试'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <View style={{ padding: 12, marginVertical: 12, borderRadius: 12, backgroundColor: '#edf6f1' }}>
    <Text style={{ fontWeight: '700' }}>血压照片识别</Text>
    <Text>拍摄血压计屏幕，识别后核对确认，不会自动入档。</Text>
    <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel="同意识别所选图片" accessibilityState={{ checked: agreed }} disabled={busy} onPress={() => setAgreed(v => !v)} style={{ paddingVertical: 10 }}>
      <Text>{agreed ? '☑' : '□'} 同意将所选图片发送至阿里云通义千问识别。请仅拍摄屏幕，避免包含姓名等无关信息；确认提交后保存原图和数据。</Text>
    </TouchableOpacity>
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <TouchableOpacity accessibilityRole="button" disabled={busy} style={button} onPress={() => choose(true)}><Text style={{ color: '#fff' }}>拍照识别</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={busy} style={button} onPress={() => choose(false)}><Text style={{ color: '#fff' }}>选择图片</Text></TouchableOpacity>
    </View>
    {busy && <Text>处理中，请稍候…</Text>}
    {!!image && <Image source={{ uri: image }} resizeMode="contain" style={{ height: 200, width: '100%' }} />}
    {draft && <View>
      <Text>{draft.message}</Text>
      {[['sys', '收缩压 / 高压（mmHg）'], ['dia', '舒张压 / 低压（mmHg）'], ['pulse', '脉搏（次/分，可留空）']].map(([key, label]) => <View key={key}>
        <Text>{label}</Text><TextInput accessibilityLabel={label} editable={!busy} style={field} keyboardType="number-pad" value={values[key] || ''} placeholder="未识别，请核对补填" onChangeText={text => { setValues(v => ({ ...v, [key]: text })); setConfirmed(false); }} />
      </View>)}
      <Text>测量时间（北京时间，默认现在，请核对）</Text>
      <TextInput accessibilityLabel="测量时间" editable={!busy} style={field} value={when} placeholder="YYYY-MM-DD HH:mm" onChangeText={v => { setWhen(v); setConfirmed(false); }} />
      <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} disabled={busy} onPress={() => setConfirmed(v => !v)} style={{ paddingVertical: 12 }}><Text>{confirmed ? '☑' : '□'} 我已核对原图、读数及测量时间，确认无误</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={busy || !confirmed} style={[button, { opacity: busy || !confirmed ? 0.5 : 1 }]} onPress={submit}><Text style={{ color: '#fff' }}>确认并提交图片记录</Text></TouchableOpacity>
    </View>}
    {!!error && <Text style={{ color: '#b42318', paddingVertical: 10 }}>{error}</Text>}
    {!!image && !busy && <TouchableOpacity onPress={() => { setImage(''); setDraft(null); setError(''); setConfirmed(false); }}><Text>取消图片录入，使用下方手工表单</Text></TouchableOpacity>}
  </View>;
}
