import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius } from '../../theme';

export default function ComingSoonScreen({ navigation, route }) {
  const title = route?.params?.title || '功能';
  const desc  = route?.params?.desc  || '该功能正在紧锣密鼓地开发中，敬请期待。';
  const icon  = route?.params?.icon  || 'construct-outline';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.pageTitle}>{title}</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={52} color={colors.primary} />
        </View>
        <Text style={styles.title}>即将上线</Text>
        <Text style={styles.desc}>{desc}</Text>
        <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>返回</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl * 2 },
  iconWrap: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: colors.primary + '12',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  desc:  { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: spacing.xl * 2 },
  btn: {
    paddingHorizontal: spacing.xl * 2, paddingVertical: 14,
    backgroundColor: colors.primary, borderRadius: radius.full,
  },
  btnText: { fontSize: 15, color: colors.white, fontWeight: '700' },
});
