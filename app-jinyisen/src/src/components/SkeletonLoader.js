import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../theme';

export function SkeletonBox({ width, height, borderRadius = radius.sm, style }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.9] });

  return (
    <Animated.View
      style={[{ width, height, borderRadius, backgroundColor: colors.border, opacity }, style]}
    />
  );
}

export function HomeScreenSkeleton() {
  return (
    <View style={sk.container}>
      {/* Header */}
      <View style={sk.header}>
        <View>
          <SkeletonBox width={120} height={20} borderRadius={10} style={{ marginBottom: 8 }} />
          <SkeletonBox width={80} height={14} borderRadius={7} />
        </View>
        <SkeletonBox width={36} height={36} borderRadius={18} />
      </View>

      {/* Score Card */}
      <View style={sk.scoreCard}>
        <View style={{ flex: 1 }}>
          <SkeletonBox width={80} height={13} borderRadius={6} style={{ marginBottom: 8 }} />
          <SkeletonBox width={60} height={36} borderRadius={8} style={{ marginBottom: 8 }} />
          <SkeletonBox width={130} height={12} borderRadius={6} />
        </View>
        <SkeletonBox width={80} height={80} borderRadius={40} />
      </View>

      {/* Vitals Row */}
      <View style={[sk.section, { flexDirection: 'row', gap: spacing.sm }]}>
        {[1,2,3,4].map(i => (
          <View key={i} style={sk.vitalCard}>
            <SkeletonBox width={36} height={36} borderRadius={10} style={{ marginBottom: 8 }} />
            <SkeletonBox width={50} height={12} borderRadius={6} style={{ marginBottom: 6 }} />
            <SkeletonBox width={40} height={20} borderRadius={6} />
          </View>
        ))}
      </View>

      {/* Tasks */}
      <View style={sk.section}>
        <SkeletonBox width={80} height={16} borderRadius={8} style={{ marginBottom: 12 }} />
        {[1,2].map(i => (
          <View key={i} style={sk.taskRow}>
            <SkeletonBox width={8} height={8} borderRadius={4} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <SkeletonBox width="80%" height={14} borderRadius={7} style={{ marginBottom: 6 }} />
              <SkeletonBox width="60%" height={11} borderRadius={5} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function RecordsScreenSkeleton() {
  return (
    <View style={sk.container}>
      <View style={[sk.section, { flexDirection: 'row', gap: spacing.xs }]}>
        {[1,2,3,4].map(i => <SkeletonBox key={i} width={64} height={36} borderRadius={8} />)}
      </View>
      <View style={[sk.section]}>
        <SkeletonBox width="100%" height={160} borderRadius={radius.lg} />
      </View>
      {[1,2,3].map(i => (
        <View key={i} style={sk.taskRow}>
          <SkeletonBox width={40} height={40} borderRadius={12} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <SkeletonBox width="60%" height={14} borderRadius={7} style={{ marginBottom: 6 }} />
            <SkeletonBox width="40%" height={11} borderRadius={5} />
          </View>
          <SkeletonBox width={50} height={24} borderRadius={radius.full} />
        </View>
      ))}
    </View>
  );
}

const sk = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg, backgroundColor: colors.primary, margin: -spacing.lg, padding: spacing.lg, paddingBottom: spacing.xl + spacing.lg },
  scoreCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg, marginTop: -spacing.lg },
  section: { marginBottom: spacing.md },
  vitalCard: { flex: 1, backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.sm, alignItems: 'center' },
  taskRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
});
