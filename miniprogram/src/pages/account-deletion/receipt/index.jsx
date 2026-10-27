import React, { useState } from 'react';
import { View, Text, Input, Button } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { accountDeletionAPI } from '../../../services/api';
import { loadDeletionReceipt } from '../../../utils/accountDeletionReceipt';
import { useAuth } from '../../../context/AuthContext';

export default function DeletionReceiptPage() {
  const { user, logout } = useAuth();
  const [token, setToken] = useState(() => loadDeletionReceipt()?.token || '');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const lookup = async () => {
    if (!token.trim() || loading) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await accountDeletionAPI.receipt(token.trim());
      setResult(res.data);
      const saved = loadDeletionReceipt();
      // Never log out a different family member who subsequently signed in on this device.
      if (res.data.status === 'completed' && saved?.token === token.trim() && user?._id && saved.userId === String(user._id)) await logout(false);
    } catch (err) { setError(err.message || '暂时无法查询，请重试'); }
    finally { setLoading(false); }
  };
  useDidShow(() => { lookup(); });
  const labels = { requested: '已收到注销申请，尚未删除账号', processing: '正在处理注销', failed: '处理尚未完成，将继续核实', completed: '账号注销已完成' };
  return <View style={{ padding: '60px 20px 24px', minHeight: '100vh', background: '#f5f7f6' }}>
    <Text style={{ display: 'block', fontSize: '22px', fontWeight: 700 }}>注销进度与回执</Text>
    <Text style={{ display: 'block', margin: '16px 0' }}>本页无需登录。请保存查询凭证；请勿将凭证提供给他人。凭证自申请之日起有效180天。</Text>
    <Input value={token} maxlength={100} onInput={e => { setToken(e.detail.value); setResult(null); }} placeholder="输入注销查询凭证" style={{ background: '#fff', padding: '14px' }} />
    <Button style={{ backgroundColor: '#1e6b50', color: '#fff', marginTop: '14px' }} loading={loading} disabled={loading || !token.trim()} onClick={lookup}>查询处理状态</Button>
    <Button style={{ backgroundColor: '#fff', color: '#1e6b50', marginTop: '12px' }} disabled={!token.trim()} onClick={() => Taro.setClipboardData({ data: token.trim() })}>复制查询凭证</Button>
    {!!error && <Text style={{ display: 'block', color: '#b42318' }}>{error}</Text>}
    {result && <View style={{ padding: '18px', background: '#fff', marginTop: '18px' }}>
      <Text style={{ display: 'block', fontWeight: 700 }}>{labels[result.status] || '状态待确认'}</Text>
      <Text style={{ display: 'block' }}>申请编号：{result.id}</Text>
      <Text style={{ display: 'block' }}>申请时间：{new Date(result.requestedAt).toLocaleString()}</Text>
      {result.completedAt ? <Text style={{ display: 'block' }}>完成时间：{new Date(result.completedAt).toLocaleString()}</Text>
        : <Text style={{ display: 'block' }}>申请时预计处理时间：{result.completionDays}天。提交申请不代表删除已经完成。</Text>}
    </View>}
    <Button style={{ backgroundColor: '#fff', color: '#1e6b50', marginTop: '18px' }} onClick={() => Taro.reLaunch({ url: '/pages/auth/login/index' })}>返回登录页</Button>
  </View>;
}
