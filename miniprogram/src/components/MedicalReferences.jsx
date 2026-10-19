import React from 'react';
import { View, Text } from '@tarojs/components';
import { openReferenceUrl } from '../utils/aiDataConsent';
export default function MedicalReferences({ references = [] }) {
  const rows = references.filter(item => item && /^https:\/\/www\.who\.int\//.test(item.url || ''));
  if (!rows.length) return null;
  return <View style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #dce5e1' }}>
    <Text style={{ display: 'block', fontSize: '12px', fontWeight: 700 }}>本条健康信息的来源</Text>
    {rows.map(item => <View key={item.id} style={{ marginTop: '8px' }}>
      <Text onClick={() => openReferenceUrl(item.url)} style={{ display: 'block', color: '#075b47', fontSize: '13px', textDecoration: 'underline' }}>{item.title} · 查看原文</Text>
      <Text style={{ display: 'block', color: '#58675f', fontSize: '12px', lineHeight: '18px', marginTop: '4px' }}>{item.applicability}</Text>
    </View>)}
  </View>;
}
