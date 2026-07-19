import React, { useState } from 'react';
import { View, Text, Input, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius } from '../../theme';
import { userAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import useNavBar from '../../hooks/useNavBar';
import Icon from '../../components/Icon';

// 首次登录最小化建档：姓名+身份证号+联系电话，其余健康信息交给问卷库分批采集。
export default function OnboardingPage() {
  const { statusBarHeight } = useNavBar();
  const { updateUser } = useAuth();
  const [name, setName] = useState('');
  const [idType, setIdType] = useState('idCard');
  const [idNumber, setIdNumber] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const canSubmit = name.trim() && contactPhone.trim() && !submitting;

  const submit = async () => {
    setErrorMsg('');
    if (!name.trim()) { setErrorMsg('请填写姓名'); return; }
    if (!contactPhone.trim()) { setErrorMsg('请填写联系电话'); return; }
    setSubmitting(true);
    try {
      const res = await userAPI.onboarding({
        name: name.trim(),
        idNumber: idNumber.trim() || undefined,
        idType,
        contactPhone: contactPhone.trim(),
      });
      if (res.success) {
        updateUser({ ...res.data.user, onboardingCompleted: true });
        Taro.switchTab({ url: '/pages/home/index' });
      } else {
        setErrorMsg(res.message || '提交失败，请重试');
      }
    } catch (err) {
      setErrorMsg(err.message || '网络错误，请重试');
    } finally { setSubmitting(false); }
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, display: 'flex', flexDirection: 'column' }}>
      <View style={{ backgroundColor: colors.surface, borderBottom: `1px solid ${colors.border}`, textAlign: 'center', padding: `${statusBarHeight + spacing.lg}px 0 ${spacing.lg}px` }}>
        <View style={{
          width: '56px', height: '56px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary10,
          margin: '0 auto 8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon name="👤" size={28} color={colors.primary} />
        </View>
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>完善基础信息</Text>
        <Text style={{ fontSize: '13px', color: colors.textSecondary, marginTop: '4px', display: 'block' }}>用于建立您的专属健康档案</Text>
      </View>

      <View style={{ flex: 1, padding: `${spacing.lg}px` }}>
        <View style={{ marginBottom: `${spacing.lg}px` }}>
          <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, marginBottom: `${spacing.sm}px`, display: 'block' }}>姓名</Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: `${radius.sm}px`, border: `1.5px solid ${colors.border}`, padding: '8px 12px' }}>
            <Input style={{ fontSize: '15px' }} placeholder="请输入您的姓名" value={name} onInput={(e) => setName(e.detail.value)} />
          </View>
        </View>

        <View style={{ marginBottom: `${spacing.lg}px` }}>
          <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, marginBottom: `${spacing.sm}px`, display: 'block' }}>证件类型</Text>
          <View style={{ display: 'flex', gap: `${spacing.sm}px` }}>
            {[{ key: 'idCard', label: '身份证' }, { key: 'passport', label: '护照' }].map((t) => (
              <View
                key={t.key}
                onClick={() => setIdType(t.key)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: `${radius.md}px`, textAlign: 'center',
                  border: `1.5px solid ${idType === t.key ? colors.primary : colors.border}`,
                  backgroundColor: idType === t.key ? colors.primary10 : colors.surface,
                }}
              >
                <Text style={{ fontSize: '14px', fontWeight: idType === t.key ? 700 : 500, color: idType === t.key ? colors.primary : colors.textMuted }}>{t.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={{ marginBottom: `${spacing.lg}px` }}>
          <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, marginBottom: `${spacing.sm}px`, display: 'block' }}>
            {idType === 'passport' ? '护照号' : '身份证号'}
          </Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: `${radius.sm}px`, border: `1.5px solid ${colors.border}`, padding: '8px 12px' }}>
            <Input
              style={{ fontSize: '15px' }}
              placeholder={idType === 'passport' ? '请输入护照号' : '用于自动识别性别与出生日期'}
              value={idNumber}
              maxlength={idType === 'passport' ? 20 : 18}
              onInput={(e) => setIdNumber(e.detail.value)}
            />
          </View>
        </View>

        <View style={{ marginBottom: `${spacing.xxl}px` }}>
          <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textSecondary, marginBottom: `${spacing.sm}px`, display: 'block' }}>联系电话</Text>
          <View style={{ backgroundColor: colors.surface, borderRadius: `${radius.sm}px`, border: `1.5px solid ${colors.border}`, padding: '8px 12px' }}>
            <Input style={{ fontSize: '15px' }} type="number" placeholder="用于健康团队与您联系" value={contactPhone} onInput={(e) => setContactPhone(e.detail.value)} />
          </View>
        </View>

        {!!errorMsg && (
          <View style={{ backgroundColor: colors.danger10, borderRadius: `${radius.sm}px`, padding: `${spacing.sm}px`, marginBottom: `${spacing.md}px` }}>
            <Text style={{ fontSize: '13px', color: colors.danger }}>{errorMsg}</Text>
          </View>
        )}

        <View style={{
          display: 'flex', gap: `${spacing.xs}px`, backgroundColor: colors.primary10, borderRadius: `${radius.sm}px`,
          padding: `${spacing.sm}px`, marginTop: `${spacing.md}px`,
        }}>
          <Text style={{ fontSize: '12px', color: colors.primary, lineHeight: '18px' }}>
            ✨ 完成后，您的健康团队会推送健康档案问卷，帮助建立更完整的健康画像。
          </Text>
        </View>
      </View>

      <View style={{ padding: `${spacing.sm}px ${spacing.lg}px ${spacing.lg}px`, backgroundColor: colors.surface, borderTop: `1px solid ${colors.border}` }}>
        <Button
          style={{
            backgroundColor: canSubmit ? colors.primary : colors.textMuted, borderRadius: `${radius.md}px`,
            height: '52px', lineHeight: '52px', color: '#fff', fontSize: '16px', fontWeight: 700,
          }}
          disabled={!canSubmit}
          loading={submitting}
          onClick={submit}
        >
          进入我的健康管家 →
        </Button>
      </View>
    </View>
  );
}
