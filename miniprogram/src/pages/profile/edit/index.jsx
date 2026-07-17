import React, { useState } from 'react';
import { View, Text, Input, Picker, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius } from '../../../theme';
import { userAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';

// 简化实现：基础资料编辑（姓名/性别/年龄/身高体重），完整版含完整健康档案数组字段
// 见 app/src/screens/profile/EditProfileScreen.js（该文件本身也有遗留问题：数组字段被注释掉，见根CLAUDE.md）
export default function EditProfilePage() {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [gender, setGender] = useState(user?.gender || '未知');
  const [age, setAge] = useState(user?.age ? String(user.age) : '');
  const [height, setHeight] = useState(user?.height ? String(user.height) : '');
  const [weight, setWeight] = useState(user?.weight ? String(user.weight) : '');
  const [saving, setSaving] = useState(false);

  const GENDER_OPTIONS = ['男', '女', '未知'];

  const save = async () => {
    setSaving(true);
    try {
      const res = await userAPI.updateMe({
        name: name.trim(),
        gender,
        age: age ? parseInt(age, 10) : undefined,
        height: height ? parseFloat(height) : undefined,
        weight: weight ? parseFloat(weight) : undefined,
      });
      if (res.success) {
        updateUser(res.data);
        Taro.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => Taro.navigateBack(), 800);
      } else {
        Taro.showToast({ title: res.message || '保存失败', icon: 'none' });
      }
    } catch (err) {
      Taro.showToast({ title: err.message || '网络错误', icon: 'none' });
    } finally { setSaving(false); }
  };

  const Field = ({ label, children }) => (
    <View style={{ marginBottom: `${spacing.md}px` }}>
      <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>{label}</Text>
      {children}
    </View>
  );

  const boxStyle = { border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px`, padding: '10px 12px', backgroundColor: '#fff' };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, padding: `${spacing.lg}px` }}>
      <Field label="姓名">
        <View style={boxStyle}><Input value={name} onInput={(e) => setName(e.detail.value)} placeholder="请输入姓名" /></View>
      </Field>
      <Field label="性别">
        <Picker mode="selector" range={GENDER_OPTIONS} value={GENDER_OPTIONS.indexOf(gender)} onChange={(e) => setGender(GENDER_OPTIONS[e.detail.value])}>
          <View style={boxStyle}><Text>{gender}</Text></View>
        </Picker>
      </Field>
      <Field label="年龄">
        <View style={boxStyle}><Input type="number" value={age} onInput={(e) => setAge(e.detail.value)} placeholder="请输入年龄" /></View>
      </Field>
      <Field label="身高（cm）">
        <View style={boxStyle}><Input type="digit" value={height} onInput={(e) => setHeight(e.detail.value)} placeholder="请输入身高" /></View>
      </Field>
      <Field label="体重（kg）">
        <View style={boxStyle}><Input type="digit" value={weight} onInput={(e) => setWeight(e.detail.value)} placeholder="请输入体重" /></View>
      </Field>

      <Button
        style={{ backgroundColor: colors.primary, color: '#fff', borderRadius: `${radius.md}px`, height: '50px', lineHeight: '50px', fontSize: '16px', fontWeight: 700, marginTop: `${spacing.lg}px` }}
        loading={saving}
        onClick={save}
      >
        保存
      </Button>
    </View>
  );
}
