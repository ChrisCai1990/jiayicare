import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { inAppServiceGroupAPI } from '../services/api';
import { chooseImageWithPrivacy, isImagePickerCancelled } from '../utils/imagePicker';
import { ensureAiDataConsent } from '../utils/aiDataConsent';
import { chooseBrowserFile } from '../utils/chooseBrowserFile';

const readDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function GroupMaterialUpload({ groupId, onSent }) {
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null);
  const [choosing, setChoosing] = useState(false);
  const [showChoices, setShowChoices] = useState(false);
  const lock = useRef(false);
  const picker = useRef(null);
  useEffect(() => () => picker.current?.abort(), []);

  const submit = async data => {
    setBusy(true);
    await inAppServiceGroupAPI.uploadMaterial(groupId, data);
    setPending(null);
    Taro.showToast({ title: '资料已提交', icon: 'success' });
    onSent?.();
  };

  const handleError = error => {
    if (!isImagePickerCancelled(error) && !/cancel/i.test(error.errMsg || '')) {
      Taro.showModal({ title: '资料未确认提交', content: error.message || '请重试，重复提交不会重复建档', showCancel: false });
    }
  };

  const finish = () => {
    picker.current = null;
    lock.current = false;
    setChoosing(false);
    setBusy(false);
  };

  const upload = async () => {
    if (lock.current) return;
    if (process.env.TARO_ENV === 'h5' && !pending) {
      setShowChoices(value => !value);
      return;
    }
    lock.current = true;
    try {
      let data = pending;
      if (!data) {
        await ensureAiDataConsent('health', { cancelText: '仅保存原件' });
        const source = await Taro.showActionSheet({ itemList: ['拍照 / 相册图片', 'PDF文件'] });
        const result = source.tapIndex === 1
          ? await Taro.chooseMessageFile({ count: 1, type: 'file', extension: ['pdf'] })
          : await chooseImageWithPrivacy({ count: 9, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
        const files = result.contents || [];
        for (const path of result.tempFilePaths || (result.tempFiles || []).map(file => file.path)) {
          const raw = Taro.getFileSystemManager().readFileSync(path, 'base64');
          files.push((source.tapIndex === 1 ? 'data:application/pdf;base64,' : 'data:image/jpeg;base64,') + raw);
        }
        if (!files.length) return;
        if (files.reduce((n, file) => n + file.length, 0) > 21 * 1024 * 1024) throw new Error('资料总大小不能超过15MB，请减少图片数量');
        data = { category: 'auto', files, requestId: 'material_' + Date.now() + '_' + Math.random().toString(36).slice(2) };
        setPending(data);
      }
      await submit(data);
    } catch (error) { handleError(error); }
    finally { finish(); }
  };

  const chooseH5 = async kind => {
    if (lock.current) return;
    lock.current = true;
    setShowChoices(false);
    try {
      picker.current = new AbortController();
      setChoosing(true);
      // Keep this call in the tap handler. Android WebView requires a live user gesture.
      const chosen = chooseBrowserFile({ accept: kind === 'pdf' ? 'application/pdf,.pdf' : 'image/*', multiple: kind !== 'pdf', signal: picker.current.signal });
      const files = kind === 'pdf' ? [await chosen].filter(Boolean) : (await chosen || []);
      if (!files.length) return;
      if (kind === 'pdf' && files[0].size > 15 * 1024 * 1024) throw new Error('PDF不能超过15MB');
      if (kind !== 'pdf' && files.length > 9) throw new Error('一次最多选择9张图片');
      if (files.some(file => kind === 'pdf' ? file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name) : !file.type.startsWith('image/'))) throw new Error('请选择图片或PDF文件');
      if (files.reduce((n, file) => n + file.size, 0) > 15 * 1024 * 1024) throw new Error('资料总大小不能超过15MB，请减少图片数量');
      await ensureAiDataConsent('health', { cancelText: '仅保存原件' });
      const contents = await Promise.all(files.map(readDataUrl));
      const data = { category: 'auto', files: contents, requestId: 'material_' + Date.now() + '_' + Math.random().toString(36).slice(2) };
      setPending(data);
      await submit(data);
    } catch (error) { handleError(error); }
    finally { finish(); }
  };

  return <View style={{ flexShrink: 0, padding: '6px 12px', background: '#fff', borderTop: '1px solid #eee' }}>
    <Text onClick={upload} style={{ color: '#187e87', fontSize: '13px', padding: '6px 0' }}>{busy ? '正在提交资料…' : pending ? '重试提交医疗资料' : '＋ 上传医疗资料'}</Text>
    {process.env.TARO_ENV === 'h5' && showChoices && <View style={{ display: 'flex', gap: '20px', padding: '10px 0' }}>
      <Text onClick={() => chooseH5('image')} style={{ color: '#187e87' }}>拍照 / 相册图片</Text>
      <Text onClick={() => chooseH5('pdf')} style={{ color: '#187e87' }}>PDF文件</Text>
    </View>}
    {choosing && <Text onClick={() => picker.current?.abort()} style={{ marginLeft: '20px', color: '#187e87', fontSize: '12px' }}>取消选择</Text>}
    {!busy && pending && <Text onClick={() => setPending(null)} style={{ marginLeft: '20px', fontSize: '12px' }}>重新选择</Text>}
  </View>;
}
