import React, { useRef, useState } from 'react';
import { View, Text, Image, Input, Button, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { recordsAPI } from '../services/api';
import { chooseImageWithPrivacy, isImagePickerCancelled } from '../utils/imagePicker';

const box = { padding: '12px', margin: '12px 0', background: '#edf6f1', borderRadius: '12px' };
const field = { background: '#fff', padding: '10px', margin: '8px 0', border: '1px solid #cedbd3', borderRadius: '6px' };
const inputField = { ...field, boxSizing: 'border-box', width: '100%', height: '48px', minHeight: '48px', fontSize: '18px', lineHeight: '28px', color: '#1A2B24' };
const mealTypes = ['空腹', '餐后2小时', '睡前', '随机'];
function localTime() {
  const d = new Date();
  const pad = v => String(v).padStart(2, '0');
  return { date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), time: pad(d.getHours()) + ':' + pad(d.getMinutes()) };
}

export default function BloodSugarPhoto({ onSaved }) {
  const [draft, setDraft] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [value, setValue] = useState('');
  const [mealType, setMealType] = useState('');
  const [when, setWhen] = useState(localTime);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const changed = (setter, next) => { setter(next); setConfirmed(false); };

  const choose = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const consent = await Taro.showModal({ title: '血糖照片识别', content: '将所选血糖仪照片发送至阿里云通义千问识别。请仅拍摄屏幕，避免包含姓名等无关信息。识别仅辅助录入，核对确认后才保存原图和数据。', confirmText: '同意选图' });
      if (!consent.confirm) return;
      const selected = await chooseImageWithPrivacy({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const path = selected.tempFilePaths[0];
      const data = Taro.getFileSystemManager().readFileSync(path, 'base64');
      if (data.length > 8 * 1024 * 1024) throw new Error('图片超过6MB，请压缩或重新拍摄');
      const mime = /\.png$/i.test(path) ? 'png' : /\.webp$/i.test(path) ? 'webp' : 'jpeg';
      const image = 'data:image/' + mime + ';base64,' + data;
      setDraft(null); setConfirmed(false); setValue(''); setMealType(''); setPhoto({ path, image }); setWhen(localTime());
      const result = await recordsAPI.recognizeBloodSugar(image);
      setDraft(result.data);
      setValue(result.data.value == null ? '' : String(result.data.value));
    } catch (err) { if (!isImagePickerCancelled(err)) setError(err.message || err.errMsg || '无法识别，请重试或在下方手工录入'); }
    finally { lock.current = false; setBusy(false); }
  };

  const submit = async () => {
    if (lock.current || !draft) return;
    if (!confirmed) { setError('请勾选确认原图、数值、测量状态和时间无误'); return; }
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0 || number >= 100) { setError('请填写有效的血糖数值'); return; }
    if (!mealType) { setError('请选择空腹、餐后2小时、睡前或随机'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      await recordsAPI.create({
        type: 'bloodSugar', category: 'vitals', label: '血糖', unit: 'mmol/L', value: String(number),
        extra: { mealType }, note: mealType,
        recordedAt: when.date + 'T' + when.time + ':00+08:00', imageUrl: photo.image,
        photoRecognition: { token: draft.token, confirmed: true },
      });
      setDraft(null); setPhoto(null); setConfirmed(false);
      Taro.showToast({ title: '记录已保存', icon: 'success' });
      onSaved?.();
    } catch (err) { setError(err.message || '保存失败，请重试'); }
    finally { lock.current = false; setBusy(false); }
  };

  return <View style={box}>
    <Button disabled={busy} loading={busy} onClick={choose}>{busy ? '处理中，请稍候' : '拍照 / 选图识别血糖'}</Button>
    <Text style={{ display: 'block', fontSize: '12px', marginTop: '8px' }}>仅支持显示 mmol/L 的血糖仪屏幕照片；识别后核对确认，不会自动入档。</Text>
    {photo && <Image src={photo.path} mode="aspectFit" style={{ width: '100%', height: '180px' }} onClick={() => Taro.previewImage({ current: photo.path, urls: [photo.path] })} />}
    {draft && <View>
      <Text>{draft.message}</Text>
      <Text style={{ display: 'block', marginTop: '8px' }}>血糖值（mmol/L）</Text>
      <Input disabled={busy} style={inputField} type="digit" value={value} placeholder="未识别，请核对补填" onInput={e => changed(setValue, e.detail.value)} />
      <Text>测量状态</Text>
      <Picker disabled={busy} mode="selector" range={mealTypes} value={Math.max(mealTypes.indexOf(mealType), 0)} onChange={e => changed(setMealType, mealTypes[Number(e.detail.value)])}>
        <View style={field}>{mealType || '请选择空腹、餐后2小时、睡前或随机'}</View>
      </Picker>
      <Text>测量时间（北京时间，默认现在，请核对）</Text>
      <Picker disabled={busy} mode="date" value={when.date} end={localTime().date} onChange={e => { setWhen(w => ({ ...w, date: e.detail.value })); setConfirmed(false); }}><View style={field}>{when.date}</View></Picker>
      <Picker disabled={busy} mode="time" value={when.time} onChange={e => { setWhen(w => ({ ...w, time: e.detail.value })); setConfirmed(false); }}><View style={field}>{when.time}</View></Picker>
      <View onClick={() => !busy && setConfirmed(v => !v)} style={{ padding: '12px 0' }}><Text>{confirmed ? '☑' : '□'} 我已核对原图、数值、测量状态及时间，确认无误</Text></View>
      <Button disabled={busy || !confirmed} onClick={submit}>确认并提交图片记录</Button>
    </View>}
    {!!error && <Text style={{ color: '#b42318', display: 'block', padding: '10px 0' }}>{error}</Text>}
    {photo && !busy && <Button onClick={() => { setDraft(null); setPhoto(null); setError(''); setConfirmed(false); }}>取消图片录入，使用下方手工表单</Button>}
  </View>;
}
