import React, { useState } from 'react';
import { View, Text, Image } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { userAPI, mediaUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { chooseImageWithPrivacy, isImagePickerCancelled } from '../utils/imagePicker';

export default function AvatarUpload() {
  const { user, updateUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const upload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await chooseImageWithPrivacy({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] });
      const path = result.tempFilePaths[0];
      let content;
      if (process.env.TARO_ENV === 'h5') {
        const blob = await (await fetch(path)).blob();
        if (blob.size > 5 * 1024 * 1024) throw new Error('请选择5MB以内的图片');
        content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
      } else {
        if (result.tempFiles?.[0]?.size > 5 * 1024 * 1024) throw new Error('请选择5MB以内的图片');
        const base64 = Taro.getFileSystemManager().readFileSync(path, 'base64');
        const mime = /\.png$/i.test(path) ? 'image/png' : /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg';
        content = `data:${mime};base64,${base64}`;
      }
      const response = await userAPI.uploadAvatar(content);
      updateUser({ ...user, avatar: response.data.avatar });
      Taro.showToast({ title: '头像已更新', icon: 'success' });
    } catch (error) { if (!isImagePickerCancelled(error)) Taro.showToast({ title: error.message || '头像上传失败，请重试', icon: 'none' }); }
    finally { setBusy(false); }
  };
  return <View onClick={upload} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px', background: '#fff', borderRadius: '12px', marginBottom: '14px' }}>
    {user?.avatar ? <Image src={mediaUrl(user.avatar)} mode="aspectFill" style={{ width: '64px', height: '64px', borderRadius: '50%' }} />
      : <View style={{ width: '64px', height: '64px', borderRadius: '50%', background: '#E3F3F3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#209FA3', fontSize: '24px' }}>{user?.name?.slice(0, 1) || '我'}</Text></View>}
    <View><Text style={{ display: 'block', fontWeight: 600 }}>{busy ? '上传中…' : '上传 / 更换头像'}</Text><Text style={{ fontSize: '12px', color: '#708080' }}>选择喜欢的图片，无需与微信头像一致</Text></View>
  </View>;
}
