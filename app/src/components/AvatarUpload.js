import React, { useState } from 'react';
import { View, Text, Image, TouchableOpacity, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { userAPI, mediaUrl } from '../services/api';
import { useAuth } from '../context/AuthContext';

export default function AvatarUpload() {
  const { user, updateUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const upload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return Alert.alert('请选择头像', '需要允许访问相册才能选择图片。');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.8, base64: true });
      if (result.canceled) return;
      const asset = result.assets[0];
      const response = await userAPI.uploadAvatar(`data:image/jpeg;base64,${asset.base64}`);
      updateUser({ ...user, avatar: response.data.avatar });
      Alert.alert('头像已更新');
    } catch (error) { Alert.alert('头像上传失败', error.message || '请重试'); }
    finally { setBusy(false); }
  };
  return <TouchableOpacity onPress={upload} disabled={busy} style={{ flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderRadius: 12, marginBottom: 16 }}>
    {user?.avatar ? <Image source={{ uri: mediaUrl(user.avatar) }} style={{ width: 64, height: 64, borderRadius: 32, marginRight: 14 }} /> : null}
    <View><Text style={{ fontWeight: '600' }}>{busy ? '上传中…' : '上传 / 更换头像'}</Text><Text style={{ fontSize: 12, color: '#708080', marginTop: 5 }}>选择喜欢的图片，无需与微信头像一致</Text></View>
  </TouchableOpacity>;
}
