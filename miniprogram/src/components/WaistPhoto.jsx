import React, { useRef, useState } from 'react';
import { View, Text, Image, Input, Button, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { useAuth } from '../context/AuthContext';
import { recordsAPI } from '../services/api';
import { chooseImageWithPrivacy, isImagePickerCancelled } from '../utils/imagePicker';

const box = { padding: '12px', margin: '12px 0', background: '#edf6f1', borderRadius: '12px' };
const field = { background: '#fff', padding: '10px', margin: '8px 0', border: '1px solid #cedbd3', borderRadius: '6px' };
const inputField = { ...field, boxSizing: 'border-box', width: '100%', height: '48px', minHeight: '48px', fontSize: '18px', lineHeight: '28px', color: '#1A2B24' };
function localTime() {
  const d = new Date();
  const pad = v => String(v).padStart(2, '0');
  return { date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), time: pad(d.getHours()) + ':' + pad(d.getMinutes()) };
}

export default function WaistPhoto({ onSaved }) {
  const { user } = useAuth();
  const consentKey = user?._id ? 'waist-photo-consent:tongyi:v1:' + user._id : null;
  const [draft, setDraft] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('cm');
  const [when, setWhen] = useState(localTime);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);

  const choose = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      let accepted = false;
      try { accepted = !!consentKey && Taro.getStorageSync(consentKey) === true; } catch {}
      if (!accepted) {
      const consent = await Taro.showModal({ title: '腰围照片识别', content: '将所选腰围测量照片发送至阿里云通义千问识别。请避免包含脸部、姓名等无关信息。识别仅辅助录入，核对确认后才保存原图和数据。', confirmText: '同意选图' });
      if (!consent.confirm) return;
      if (consentKey) { try { Taro.setStorageSync(consentKey, true); } catch {} }
      }
      const selected = await chooseImageWithPrivacy({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const path = selected.tempFilePaths[0];
      const data = Taro.getFileSystemManager().readFileSync(path, 'base64');
      if (data.length > 8 * 1024 * 1024) throw new Error('图片超过6MB，请压缩或重新拍摄');
      const mime = /\.png$/i.test(path) ? 'png' : /\.webp$/i.test(path) ? 'webp' : 'jpeg';
      const image = 'data:image/' + mime + ';base64,' + data;
      setDraft(null); setConfirmed(false); setValue(''); setUnit('cm'); setPhoto({ path, image }); setWhen(localTime());
      const result = await recordsAPI.recognizeWaist(image);
      setDraft(result.data);
      if (result.data.value == null || String(result.data.value).trim() === '') setError('未识别出腰围，请重新拍摄清晰的腰围测量读数，或手动补填。');
      setValue(result.data.value == null ? '' : String(result.data.value));
      setUnit('cm');
    } catch (err) { if (!isImagePickerCancelled(err)) setError(err.message || err.errMsg || '无法识别，请重试或在下方手工录入'); }
    finally { lock.current = false; setBusy(false); }
  };

  const submit = async () => {
    if (lock.current || !draft) return;
    if (!confirmed) { setError('请勾选确认原图、腰围和测量时间无误'); return; }
    const number = Number(value);
    const cmValue = number;
    if (!Number.isFinite(cmValue) || cmValue <= 0 || cmValue >= 500) { setError('请填写有效的腰围数值'); return; }
    lock.current = true; setBusy(true); setError('');
    try {
      const saved = await recordsAPI.create({
        type: 'waist', category: 'vitals', label: '腰围', unit: 'cm', value: String(Math.round(cmValue * 100) / 100),
        recordedAt: when.date + 'T' + when.time + ':00+08:00', imageUrl: photo.image,
        photoRecognition: { token: draft.token, confirmed: true },
      });
      setDraft(null); setPhoto(null); setConfirmed(false);
      if(saved.feedback) await Taro.showModal({title:saved.feedback.title,content:saved.feedback.text,showCancel:false,confirmText:'知道了'});
      Taro.showToast({ title: '记录已保存', icon: 'success' });
      onSaved?.();
    } catch (err) { setError(err.message || '保存失败，请重试'); }
    finally { lock.current = false; setBusy(false); }
  };

  return <View style={box}>
    <Button disabled={busy} loading={busy} onClick={choose}>{busy ? '处理中，请稍候' : '拍照 / 选图识别腰围'}</Button>
    <Text style={{ display: 'block', fontSize: '12px', marginTop: '8px' }}>请上传清晰的腰围测量照片（cm）；识别后需核对数值与测量时间。</Text>
    <Text style={{ display: 'block', fontSize: '12px', marginTop: '8px' }}>照片将发送至阿里云通义千问识别，仅辅助录入。</Text>
    <Text style={{ display: 'block', fontSize: '12px', color: '#1E6B50', padding: '8px 0' }} onClick={async () => {
      const answer = await Taro.showModal({ title: '腰围照片识别说明', content: '所选照片发送至阿里云通义千问识别；核对确认后才保存原图和数据。您可以撤回同意，下次使用时会重新询问。', confirmText: '撤回同意', cancelText: '关闭' });
      if (answer.confirm && consentKey) { Taro.removeStorageSync(consentKey); Taro.showToast({ title: '已撤回同意', icon: 'none' }); }
    }}>识别说明与授权管理</Text>
    {photo && <Image src={photo.path} mode="aspectFit" style={{ width: '100%', height: '180px' }} onClick={() => Taro.previewImage({ current: photo.path, urls: [photo.path] })} />}
    {draft && <View>
      <Text>{draft.message}</Text>
      <Text style={{ display: 'block', marginTop: '8px' }}>腰围</Text>
      <Input disabled={busy} style={inputField} type="digit" value={value} placeholder="未识别，请核对补填" onInput={e => { setValue(e.detail.value); setConfirmed(false); }} />
      <Text>测量时间（北京时间，默认现在，请核对）</Text>
      <Picker disabled={busy} mode="date" value={when.date} end={localTime().date} onChange={e => { setWhen(w => ({ ...w, date: e.detail.value })); setConfirmed(false); }}><View style={field}>{when.date}</View></Picker>
      <Picker disabled={busy} mode="time" value={when.time} onChange={e => { setWhen(w => ({ ...w, time: e.detail.value })); setConfirmed(false); }}><View style={field}>{when.time}</View></Picker>
      <View onClick={() => !busy && setConfirmed(v => !v)} style={{ padding: '12px 0' }}><Text>{confirmed ? '☑' : '□'} 我已核对原图、腰围及测量时间，确认无误</Text></View>
      <Button disabled={busy || !confirmed} onClick={submit}>确认并提交图片记录</Button>
    </View>}
    {!!error && <Text style={{ color: '#b42318', display: 'block', padding: '10px 0' }}>{error}</Text>}
    {photo && !busy && <Button onClick={() => { setDraft(null); setPhoto(null); setError(''); setConfirmed(false); }}>取消图片录入，使用下方手工表单</Button>}
  </View>;
}
