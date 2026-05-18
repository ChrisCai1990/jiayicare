import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, gradient } from '../theme';

export default function EmptyState({ icon = 'document-outline', title, subtitle, actionLabel, onAction, color }) {
  const c = color || colors.primary;
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconCircle, { backgroundColor: c + '12', borderColor: c + '25' }]}>
        <Ionicons name={icon} size={38} color={c} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: c }]} onPress={onAction} activeOpacity={0.85}>
          <Ionicons name="add" size={16} color={colors.white} />
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 52, paddingHorizontal: 32 },
  iconCircle: {
    width: 88, height: 88, borderRadius: 44,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, marginBottom: spacing.lg,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 240 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.lg, paddingHorizontal: 20, paddingVertical: 11,
    borderRadius: radius.full,
  },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.white },
});
