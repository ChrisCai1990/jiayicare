import React, { useState, useCallback } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../theme';
import { medicationsAPI } from '../../services/api';
import useNavBar from '../../hooks/useNavBar';
import Icon from '../../components/Icon';

// 简化实现：用药列表 + 打卡，完整版含新增/停用弹窗见 app/src/screens/medication/MedicationScreen.js
export default function MedicationPage() {
  const { statusBarHeight } = useNavBar();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    medicationsAPI.list('active').then((res) => { if (res.success) setList(res.data || []); })
      .catch(() => {}).finally(() => setLoading(false));
  }, []);

  useDidShow(() => { load(); });

  const checkin = async (id) => {
    try {
      await medicationsAPI.checkin(id);
      Taro.showToast({ title: '打卡成功', icon: 'success' });
      load();
    } catch (err) {
      Taro.showToast({ title: err.message || '打卡失败', icon: 'none' });
    }
  };

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
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>用药管理</Text>
        <View style={{ width: '28px' }} />
      </View>

      <View style={{ padding: `${spacing.lg}px` }}>
      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
      ) : list.length === 0 ? (
        <View style={{ textAlign: 'center', padding: `${spacing.xxl}px 0` }}>
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无用药记录</Text>
        </View>
      ) : (
        list.map((med) => (
          <View key={med._id} style={{
            backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: '10px', boxShadow: shadow.card,
          }}>
            <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{med.name || med.chemicalName}</Text>
                <Text style={{ fontSize: '12px', color: colors.textMuted }}>{med.dose} · {med.frequency}</Text>
              </View>
              <View
                onClick={() => checkin(med._id)}
                style={{ padding: '8px 16px', backgroundColor: colors.primary10, borderRadius: `${radius.full}px` }}
              >
                <Text style={{ fontSize: '12px', color: colors.primary, fontWeight: 700 }}>打卡</Text>
              </View>
            </View>
          </View>
        ))
      )}
      </View>
    </View>
  );
}
