import React, { useEffect, useState } from 'react';
import { View, Text, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { accountDeletionAPI } from '../services/api';
import { saveDeletionReceipt } from '../utils/accountDeletionReceipt';
import { useAuth } from '../context/AuthContext';
import { colors, radius } from '../theme';

export default function AccountDeletionPanel() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    setLoading(true); setError(''); setState(null);
    accountDeletionAPI.get().then(res => {
      if (!res?.success || !res.data) throw new Error('无法读取注销信息');
      if (active) {
        setState(res.data);
        if (res.data.receipt) saveDeletionReceipt(res.data.receipt, user?._id);
      }
    }).catch(err => { if (active) setError(err.message || '无法读取注销信息'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, retry]);
  const submit = async () => {
    if (submitting || !state?.available || !state.confirmationToken || state.request) return;
    setSubmitting(true); setError('');
    try {
      const confirmation = await Taro.showModal({ title: '确认申请注销当前账号',
        content: `${state.policy.notice}\n预计处理时间：${state.policy.completionDays}天。申请提交后会显示处理状态，提交申请不等于删除完成。`,
        confirmText: '确认申请', cancelText: '暂不注销' });
      if (!confirmation.confirm) return;
      const res = await accountDeletionAPI.submit(state.confirmationToken);
      if (!res?.success || !res.data) throw new Error('注销申请未确认，请重试');
      setState(current => ({ ...current, request: res.data, confirmationToken: null }));
      saveDeletionReceipt(res.data.receipt, user?._id);
      await Taro.navigateTo({ url: '/pages/account-deletion/receipt/index' });
    } catch (err) { setError(err.message || '提交失败，请重试'); }
    finally { setSubmitting(false); }
  };
  const request = state?.request;
  const statusText = { requested: '注销申请已提交，尚未删除账号', processing: '正在处理注销申请',
    needs_review: '正在核实注销事项，无需重复提交', failed: '注销处理未完成', completed: '注销处理已完成' };
  return <View style={{ marginTop: '28px', backgroundColor: '#fff', padding: '16px', borderRadius: `${radius.md}px` }}>
    <Button onClick={() => setOpen(value => !value)} disabled={submitting} style={{ color: colors.danger, backgroundColor: '#fff' }}>注销账号</Button>
    {open && <View style={{ marginTop: '12px' }}>
      <Text style={{ display: 'block' }}>注销账号涉及账号及相关个人数据的处理，请阅读说明后确认。</Text>
      {loading && <Text>正在读取…</Text>}
      {!!error && <View><Text style={{ color: colors.danger, backgroundColor: '#fff' }}>{error}</Text><Button style={{ color: colors.primary, backgroundColor: '#fff' }} disabled={submitting} onClick={() => setRetry(value => value + 1)}>重新读取</Button></View>}
      {request && <View>
        <Text style={{ display: 'block' }}>{statusText[request.status] || '处理状态待确认'}</Text>
        <Text style={{ display: 'block' }}>申请编号：{request.id}</Text>
        <Text style={{ display: 'block' }}>{request.notice}</Text>
        {request.status !== 'completed' && <Text style={{ display: 'block' }}>申请时告知的预计处理时间：{request.completionDays}天。</Text>}
        <Button style={{ color: colors.primary, backgroundColor: '#fff' }} onClick={() => setRetry(value => value + 1)}>刷新处理状态</Button>
        <Button style={{ color: colors.primary, backgroundColor: '#fff' }} onClick={() => Taro.navigateTo({ url: '/pages/account-deletion/receipt/index' })}>查看注销回执</Button>
      </View>}
      {state && !request && !state.available && <Text style={{ display: 'block' }}>注销服务暂不可用，尚未提交申请。</Text>}
      {state?.available && !request && <View>
        <Text style={{ display: 'block', margin: '12px 0' }}>{state.policy.notice}</Text>
        <Text style={{ display: 'block' }}>预计处理时间：{state.policy.completionDays}天。</Text>
        <Button loading={submitting} disabled={submitting || !state.confirmationToken} onClick={submit} style={{ color: colors.danger, backgroundColor: '#fff' }}>申请注销当前账号</Button>
      </View>}
    </View>}
  </View>;
}
