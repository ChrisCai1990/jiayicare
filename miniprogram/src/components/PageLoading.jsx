import React from 'react';
import { View, Text } from '@tarojs/components';
import { colors } from '../theme';
import { useLanguage } from '../i18n';

// Follows the page's real loading state, never adds a fixed artificial delay.
export default function PageLoading({ fullPage = false, top = 64 }) {
  const { t } = useLanguage();
  return <View style={{ boxSizing: 'border-box', minHeight: fullPage ? '100vh' : '160px', width: '100%', padding: fullPage ? `${top + 44}px 24px 32px` : '32px 24px', backgroundColor: colors.background, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: fullPage ? 'flex-start' : 'center', gap: '14px' }}>
    <View className="jy-page-loading-spinner" />
    <Text style={{ fontSize: '15px', color: colors.textSecondary }}>{t('正在加载，请稍候…')}</Text>
  </View>;
}
