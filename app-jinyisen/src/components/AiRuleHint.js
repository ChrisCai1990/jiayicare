import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../theme';
import { AI_RULES, AI_COMMON_NOTE } from '../config/aiRules';

// AI 规则说明（客户端）：默认收起为一行，点击展开看 AI 的依据/规则/参考价值，让客户放心。
export default function AiRuleHint({ scene, style }) {
  const [open, setOpen] = useState(false);
  const rule = AI_RULES[scene];
  if (!rule) return null;

  return (
    <View style={[styles.box, style]}>
      <TouchableOpacity style={styles.header} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
        <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
        <Text style={styles.headerText}>{rule.title}是怎么来的？</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={colors.primary} style={{ marginLeft: 'auto' }} />
      </TouchableOpacity>
      {open && (
        <View style={styles.body}>
          <Text style={styles.line}><Text style={styles.b}>依据：</Text>{rule.basis}</Text>
          <Text style={styles.line}><Text style={styles.b}>规则：</Text>{rule.rule}</Text>
          <Text style={[styles.line, { color: colors.warning }]}><Text style={styles.b}>说明：</Text>{rule.note}</Text>
          <Text style={styles.common}>{AI_COMMON_NOTE}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.primary + '30', backgroundColor: colors.primary + '08', borderRadius: radius.md, marginBottom: spacing.md, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 10 },
  headerText: { fontSize: 13, fontWeight: '600', color: colors.primary },
  body: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: 4 },
  line: { fontSize: 12.5, color: colors.textSecondary, lineHeight: 19 },
  b: { fontWeight: '700', color: colors.textPrimary },
  common: { fontSize: 11.5, color: colors.textMuted, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.primary + '20', lineHeight: 17 },
});
