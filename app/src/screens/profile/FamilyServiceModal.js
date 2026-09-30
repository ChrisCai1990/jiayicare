import React, { useEffect, useState } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { familyLinksAPI } from '../../services/api';
import { colors, spacing, radius } from '../../theme';

function dateText(value) {
  if (!value) return '待安排';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '待确认' : date.toLocaleDateString('zh-CN');
}

export default function FamilyServiceModal({ memberId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null); setError(''); setLoading(true);
    familyLinksAPI.serviceOverview(memberId).then(result => {
      if (!result?.success || String(result.data?.member?._id) !== String(memberId) || !result.data?.service) {
        throw new Error('服务信息暂时不可用，请重试');
      }
      if (active) setData(result.data);
    }).catch(e => { if (active) setError(e.message || '获取服务信息失败，请重试'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [memberId, attempt]);
  const current = String(data?.member?._id) === String(memberId) ? data : null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>家庭服务安排</Text>
          <Text style={styles.note}>仅展示服务进度与预约安排，不展示健康档案和医疗资料</Text>
          <ScrollView>
            {loading ? <ActivityIndicator accessibilityLabel="正在加载服务" color={colors.primary} /> : error ? (
              <View>
                <Text accessibilityRole="alert" style={styles.note}>{error}</Text>
                <TouchableOpacity accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={styles.button}><Text style={styles.buttonText}>重试</Text></TouchableOpacity>
              </View>
            ) : current ? (
              <View>
                <Text style={styles.title}>{current.member.name}的服务安排</Text>
                <Text style={styles.line}>进行中的服务：{current.service.activeCount ?? 0} 项</Text>
                {!!current.service.latestServiceName && <Text style={styles.line}>{current.service.latestServiceName} · {current.service.latestStatus}</Text>}
                <Text style={styles.title}>服务时间安排（最近5项）</Text>
                {(Array.isArray(current.appointments) ? current.appointments : []).slice(0, 5).map((item, index) => (
                  <View key={index} style={styles.row}>
                    <Text style={styles.line}>{item.serviceName}</Text>
                    <Text style={styles.note}>{item.status || '等待安排'}</Text>
                    <Text style={styles.line}>{dateText(item.scheduledAt || item.desiredServiceDate)}</Text>
                    <Text style={styles.note}>{item.dateLabel || '待确认'}</Text>
                  </View>
                ))}
                {!current.appointments?.length && <Text style={styles.note}>暂无预约安排</Text>}
              </View>
            ) : null}
          </ScrollView>
          <TouchableOpacity accessibilityRole="button" onPress={onClose} style={styles.button}><Text style={styles.buttonText}>关闭</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: 36, maxHeight: '85%' },
  title: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginVertical: spacing.sm },
  note: { fontSize: 13, color: colors.textSecondary, marginVertical: spacing.sm },
  line: { fontSize: 15, color: colors.textPrimary, marginVertical: spacing.xs },
  row: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: spacing.sm },
  button: { padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center', marginTop: spacing.sm },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
