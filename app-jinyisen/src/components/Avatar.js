import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';

// 根据名字生成颜色
const PALETTE = [
  '#0ABAB5', '#34C88A', '#5BA4F5', '#A78BFA',
  '#F59E0B', '#F06B6B', '#0891B2', '#059669',
];
function colorFor(name = '') {
  const code = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return PALETTE[code % PALETTE.length];
}

export default function Avatar({ name = '', size = 44, icon, iconSize, style, textStyle }) {
  const bg = colorFor(name);
  const initial = name ? name.charAt(0) : '';
  const fontSize = size * 0.38;

  return (
    <View style={[
      styles.base,
      { width: size, height: size, borderRadius: size / 2, backgroundColor: bg + '20', borderColor: bg + '40' },
      style,
    ]}>
      {icon
        ? <Ionicons name={icon} size={iconSize || size * 0.45} color={bg} />
        : <Text style={[styles.text, { fontSize, color: bg }, textStyle]}>{initial}</Text>
      }
    </View>
  );
}

// 带白底边框的头像（用于深色背景上）
export function AvatarOnDark({ name = '', size = 60, style }) {
  const bg = colorFor(name);
  const initial = name ? name.charAt(0) : '';
  const fontSize = size * 0.38;

  return (
    <View style={[
      { width: size, height: size, borderRadius: size / 2 },
      { backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.5)' },
      styles.center, style,
    ]}>
      <Text style={{ fontSize, fontWeight: '700', color: colors.white }}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '700' },
});
