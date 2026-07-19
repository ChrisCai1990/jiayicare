import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../theme';

const STATUS_CONFIG = {
  normal: { bg: '#E8F8F0', text: '#27AE60', label: '正常' },
  warning: { bg: '#FEF3E2', text: '#F5A623', label: '偏高' },
  danger: { bg: '#FDEEEC', text: '#E74C3C', label: '异常' },
  completed: { bg: '#E8F8F0', text: '#27AE60', label: '已完成' },
  pending: { bg: '#EEF2FF', text: '#5B6CF3', label: '待完成' },
  overdue: { bg: '#FDEEEC', text: '#E74C3C', label: '已逾期' },
};

export default function StatusBadge({ status, customLabel, size = 'sm' }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.normal;
  const label = customLabel || config.label;
  const fontSize = size === 'sm' ? 10 : 12;

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.text, { color: config.text, fontSize }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  text: {
    fontWeight: '600',
  },
});
