import React from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { colors, spacing, radius } from '../../../theme';

export default function ComingSoonPage() {
  const router = useRouter();
  const title = router.params?.title || '功能';
  const desc = router.params?.desc || '该功能正在紧锣密鼓地开发中，敬请期待。';

  return (
    <View style={{
      minHeight: '100vh', backgroundColor: colors.background, display: 'flex',
      flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: `${spacing.xl}px`,
    }}>
      <View style={{
        width: '100px', height: '100px', borderRadius: '50px', backgroundColor: colors.primary10,
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: `${spacing.xl}px`,
      }}>
        <Text style={{ fontSize: '44px' }}>🚧</Text>
      </View>
      <Text style={{ fontSize: '22px', fontWeight: 800, color: colors.textPrimary, marginBottom: `${spacing.sm}px` }}>{title}即将上线</Text>
      <Text style={{ fontSize: '14px', color: colors.textSecondary, textAlign: 'center', lineHeight: '22px', marginBottom: `${spacing.xl}px` }}>{desc}</Text>
      <View
        style={{ padding: '14px 48px', backgroundColor: colors.primary, borderRadius: `${radius.full}px` }}
        onClick={() => Taro.navigateBack()}
      >
        <Text style={{ fontSize: '15px', color: '#fff', fontWeight: 700 }}>返回</Text>
      </View>
    </View>
  );
}
