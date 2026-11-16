import React from 'react';
import { Button, Navigator, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import Icon from './Icon';
import { colors } from '../theme';
import { useLanguage } from '../i18n';
import { returnToPrevious } from '../utils/returnToPrevious';

export default function BackButton({ onClick, destination, color = colors.primary, style }) {
  const { t } = useLanguage();
  const Control = destination ? Navigator : Button;
  return <Control url={destination} openType={destination ? 'switchTab' : undefined} className="jy-back-button" aria-label={t('返回')} hoverClass="jy-back-button-pressed" onClick={destination ? undefined : event => { event.stopPropagation(); (onClick || (() => returnToPrevious(Taro)))(event); }} style={{ width: '72px', minWidth: '72px', maxWidth: '72px', flex: '0 0 72px', whiteSpace: 'nowrap', height: '44px', padding: '0 6px', margin: 0, background: 'transparent', border: 0, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', flexShrink: 0, position: 'relative', zIndex: 2, color, ...style }}>
    <Icon name="chevron-left" size={20} color={color} />
    <Text style={{ fontSize: '16px' }}>{t('返回')}</Text>
  </Control>;
}
