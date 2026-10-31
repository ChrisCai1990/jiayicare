import React, { useEffect, useState } from 'react';
import { View, Text, Textarea } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import { expertConsultationsAPI } from '../../../services/api';

const green = '#246B50';
const stages = { team_assignment: '正在分配服务团队', intake: '健管专员整理资料', advisor: '健康顾问准备转介信', planner: '健康规划师安排专家', expert: '等待专家咨询及书面回复', reconcile: '健康顾问协调专家意见', followup: '健管专员拟随访计划', final_review: '健康顾问审核计划', completed: '服务完成', cancelled: '已取消' };
const line = { marginTop: '12px', lineHeight: 1.6, color: '#344E44', fontSize: '14px' };

export default function ConsultationOrderPage() {
  const params = useRouter().params || {};
  const orderId = params.orderId;
  const [cases, setCases] = useState([]);
  const [experts, setExperts] = useState([]);
  const [requestText, setRequestText] = useState('');
  const [expertId, setExpertId] = useState('');
  const [busy, setBusy] = useState(false);
  const row = cases.find(item => String(item.orderId) === String(orderId));
  const load = async () => {
    try {
      const [caseResult, expertResult] = await Promise.all([expertConsultationsAPI.mine(), expertConsultationsAPI.experts(params.type)]);
      setCases(caseResult.data || []); setExperts(expertResult.data || []);
    } catch (error) { Taro.showToast({ title: error.message || '加载失败', icon: 'none' }); }
  };
  useDidShow(() => { load(); });
  useEffect(() => { Taro.setNavigationBarTitle({ title: '专家咨询与会诊' }); }, []);
  const submit = async () => {
    if (!requestText.trim()) return Taro.showToast({ title: '请填写希望咨询的问题', icon: 'none' });
    setBusy(true);
    try {
      await expertConsultationsAPI.submit(orderId, requestText.trim(), expertId);
      Taro.showToast({ title: '已提交服务团队', icon: 'success' });
      await load();
    } catch (error) { Taro.showToast({ title: error.message || '提交失败', icon: 'none' }); }
    finally { setBusy(false); }
  };
  return <View style={{ minHeight: '100vh', padding: '24px 18px', backgroundColor: '#F4F8F5', boxSizing: 'border-box' }}>
    <View onClick={() => Taro.navigateBack()} style={{ color: green, marginBottom: '16px', fontSize: '14px' }}>‹ 返回订单</View>
    <Text style={{ display: 'block', fontSize: '22px', fontWeight: 700, color: '#193A2C' }}>专家咨询与会诊</Text>
    <Text style={{ ...line, display: 'block' }}>本服务提供咨询分析和后续管理路径，不代替线下诊断或治疗。</Text>
    {!row ? <View style={{ background: '#fff', borderRadius: '12px', padding: '16px', marginTop: '20px' }}>
      <Text style={{ display: 'block', fontWeight: 700, color: '#193A2C' }}>告诉我们您希望讨论的问题</Text>
      <Textarea value={requestText} onInput={event => setRequestText(event.detail.value)} maxlength={1500}
        placeholder="例如：希望专家重点分析哪些检查结果、治疗选择或后续管理问题"
        style={{ width: '100%', minHeight: '110px', boxSizing: 'border-box', marginTop: '12px', border: '1px solid #CADBD2', borderRadius: '8px', padding: '10px' }}/>
      <Text style={{ ...line, display: 'block' }}>指定专家（可不选）</Text>
      <View onClick={() => setExpertId('')} style={{ ...line, padding: '8px', border: expertId ? '1px solid #D8E4DC' : `2px solid ${green}`, borderRadius: '8px' }}>由健康规划师匹配</View>
      {experts.map(expert => <View key={expert._id} onClick={() => setExpertId(expert._id)} style={{ ...line, padding: '8px', border: expertId === expert._id ? `2px solid ${green}` : '1px solid #D8E4DC', borderRadius: '8px' }}>{expert.name} · {expert.title}</View>)}
      <View onClick={busy ? undefined : submit} style={{ marginTop: '20px', background: green, color: '#fff', textAlign: 'center', padding: '12px', borderRadius: '8px', opacity: busy ? 0.5 : 1 }}>提交咨询需求</View>
    </View> : <View style={{ background: '#fff', borderRadius: '12px', padding: '16px', marginTop: '20px' }}>
      <Text style={{ display: 'block', fontWeight: 700, color: green }}>当前进度：{stages[row.status] || row.status}</Text>
      <Text style={{ ...line, display: 'block' }}>咨询问题：{row.clientRequest}</Text>
      {row.scheduledAt && <Text style={{ ...line, display: 'block' }}>预约时间：{new Date(row.scheduledAt).toLocaleString('zh-CN')}</Text>}
      {row.meetingUrl && <View onClick={() => { Taro.setClipboardData({ data: row.meetingUrl }); }} style={{ ...line, color: green }}>复制会诊链接，在约定时间加入</View>}
      {row.managementPath && <Text style={{ ...line, display: 'block' }}>管理路径：{row.managementPath}</Text>}
      {row.followupPlan && <Text style={{ ...line, display: 'block' }}>随访计划：{row.followupPlan}</Text>}
    </View>}
  </View>;
}
