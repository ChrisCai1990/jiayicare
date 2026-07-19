import React from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import { colors, spacing, radius } from '../../../theme';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';

export default function ComingSoonPage() {
  const { statusBarHeight } = useNavBar();
  const router = useRouter();
  const title = router.params?.title || '功能';
  const desc = router.params?.desc || '该功能正在紧锣密鼓地开发中，敬请期待。';

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`,
        backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`,
      }}>
        <View onClick={() => Taro.navigateBack()} style={{ padding: '4px' }}>
          <Icon name="chevron-left" size={20} color={colors.textPrimary} />
        </View>
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>{title}</Text>
        <View style={{ width: '28px' }} />
      </View>

      <View style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: `${spacing.xl}px`, minHeight: 'calc(100vh - 100px)', boxSizing: 'border-box',
      }}>
        <View style={{
          width: '100px', height: '100px', borderRadius: '50px', backgroundColor: colors.primary10,
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: `${spacing.xl}px`,
        }}>
          <Icon name="🚧" size={44} color={colors.primary} />
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
    </View>
  );
}
