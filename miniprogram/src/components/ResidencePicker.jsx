import React from 'react';
import { View, Text, Input, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, radius, spacing } from '../theme';

const PROVINCES = [
  '北京市', '天津市', '河北省', '山西省', '内蒙古自治区', '辽宁省', '吉林省', '黑龙江省',
  '上海市', '江苏省', '浙江省', '安徽省', '福建省', '江西省', '山东省', '河南省',
  '湖北省', '湖南省', '广东省', '广西壮族自治区', '海南省', '重庆市', '四川省',
  '贵州省', '云南省', '西藏自治区', '陕西省', '甘肃省', '青海省', '宁夏回族自治区',
  '新疆维吾尔自治区', '香港特别行政区', '澳门特别行政区', '台湾省',
];

// Taro H5 的 Picker 没有 region 模式；微信小程序继续使用系统地区选择器。
export default function ResidencePicker({ value = [], onChange, style }) {
  if (Taro.getEnv() !== Taro.ENV_TYPE.WEB) {
    return (
      <Picker mode="region" value={value} onChange={(event) => onChange(event.detail.value || [])}>
        <View style={style}><Text style={{ color: value.length ? colors.textPrimary : colors.textMuted }}>{value.length ? value.join(' ') : '请选择省 / 市 / 区'}</Text></View>
      </Picker>
    );
  }

  const provinceIndex = PROVINCES.indexOf(value[0]);
  return (
    <View>
      <Picker mode="selector" range={PROVINCES} value={provinceIndex < 0 ? 0 : provinceIndex}
        onChange={(event) => {
          const province = PROVINCES[Number(event.detail.value)];
          if (province) onChange(province === value[0] ? value : [province, '', '']);
        }}>
        <View style={style}><Text style={{ color: value[0] ? colors.textPrimary : colors.textMuted }}>{value[0] || '请选择省份'}</Text></View>
      </Picker>
      <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginTop: `${spacing.sm}px` }}>
        <View style={{ flex: 1, minWidth: 0, padding: '10px 12px', backgroundColor: colors.surface, border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px` }}>
          <Input value={value[1] || ''} placeholder="请输入城市" onInput={(event) => onChange([value[0] || '', event.detail.value, value[2] || ''])} />
        </View>
        <View style={{ flex: 1, minWidth: 0, padding: '10px 12px', backgroundColor: colors.surface, border: `1.5px solid ${colors.border}`, borderRadius: `${radius.sm}px` }}>
          <Input value={value[2] || ''} placeholder="区 / 县（选填）" onInput={(event) => onChange([value[0] || '', value[1] || '', event.detail.value])} />
        </View>
      </View>
    </View>
  );
}
