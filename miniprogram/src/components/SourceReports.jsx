import React, { useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { reportsAPI } from '../services/api';
import { openOriginalFile } from '../utils/openOriginalFile';

export default function SourceReports({ reportIds = [] }) {
  const [opening, setOpening] = useState('');
  const ids = [...new Set((Array.isArray(reportIds) ? reportIds : []).map(String).filter(id => /^[a-f0-9]{24}$/i.test(id)))];
  if (!ids.length) return null;
  async function open(id) {
    if (opening) return;
    setOpening(id);
    try {
      const result = await reportsAPI.get(id);
      if (!result.success || !result.data) throw new Error('原始报告暂不可用');
      await openOriginalFile(result.data);
    } catch (error) {
      Taro.showToast({ title: error.message || '原始报告暂不可用', icon: 'none' });
    } finally { setOpening(''); }
  }
  return <View style={{ marginTop: '10px', borderTop: '1px solid #dce5e1', paddingTop: '8px' }}>
    <Text style={{ display: 'block', fontSize: '12px', color: '#58675f' }}>本部分整理使用的原始报告。涉及诊疗决定，请携带原件咨询执业医师。</Text>
    {ids.map((id, i) => <Text key={id} onClick={() => open(id)} style={{ display: 'block', padding: '10px 0', color: '#075b47', fontSize: '13px', textDecoration: 'underline' }}>{opening === id ? '正在打开…' : `查看原始报告 ${i + 1}`}</Text>)}
  </View>;
}
