import React, { useState } from 'react';
import { View, Text, Input, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { authAPI, userAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { leaveReviewEnvironment } from '../utils/reviewEnvironment';

export default function ReviewLogin() {
  const { login, updateUser, logout } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const submit = async () => {
    if (loading || !agreed) return;
    setLoading(true); setError('');
    try {
      const result = await authAPI.reviewLogin(username, password);
      await login(result.data.user, result.data.token);
      const profile = await userAPI.getMe();
      if (!profile?.success || !profile.data) throw new Error('测试资料加载失败，请重试');
      updateUser(profile.data);
      setPassword('');
      await new Promise(resolve => Taro.nextTick(resolve));
      await Taro.switchTab({ url: '/pages/home/index' });
    } catch (e) { await logout(); setError(e.message || '测试登录失败，请稍后重试'); }
    finally { setLoading(false); }
  };
  const inputStyle = { padding: '14px', marginBottom: '14px', background: '#fff', color: '#1A2B24', border: '1px solid #8DA99C', borderRadius: '12px', fontSize: '16px' };
  return <View style={{ minHeight: '100vh', boxSizing: 'border-box', padding: '40px 24px', background: '#F2EDE3', fontSize: '16px' }}>
    <Text style={{ display: 'block', fontSize: '24px', fontWeight: 700, color: '#1A2B24' }}>专用测试账号登录</Text>
    <Text style={{ display: 'block', lineHeight: '24px', margin: '20px 0', color: '#4A6558' }}>仅使用合成测试资料，请勿填写真实身份或上传真实报告。此环境不发送短信、推送，不执行真实支付；AI功能以登录后的服务状态及授权为准，无真人值守。</Text>
    <Input value={username} onInput={e => setUsername(e.detail.value)} placeholder="测试账号" maxlength={64} style={inputStyle} />
    <Input value={password} onInput={e => setPassword(e.detail.value)} password placeholder="独立密码" maxlength={72} style={inputStyle} />
    <View onClick={() => setAgreed(!agreed)} style={{ margin: '18px 0', padding: '12px 0', minHeight: '44px', color: '#1E6B50', fontSize: '16px', lineHeight: '28px' }}>
      <Text style={{ fontSize: '24px' }}>{agreed ? '☑' : '☐'} </Text><Text>我已阅读测试说明及</Text>
      {['terms', 'privacy', 'service'].map((type, i) => <Text key={type} onClick={e => { e.stopPropagation?.(); Taro.navigateTo({ url: `/pages/legal/index?type=${type}` }); }}>{['《用户协议》', '《隐私政策》', '《健康管理服务说明》'][i]}</Text>)}
    </View>
    {!!error && <Text style={{ display: 'block', color: '#B42318', marginBottom: '16px' }}>{error}</Text>}
    <Button onClick={submit} loading={loading} disabled={loading || !agreed || !username || !password} style={{ background: '#1E6B50', color: '#fff', marginBottom: '16px' }}>登录测试账号</Button>
    <Button onClick={() => Taro.navigateTo({ url: '/pages/account-deletion/receipt/index' })} style={{ background: '#fff', color: '#1E6B50', marginBottom: '16px' }}>查询注销进度／回执</Button>
    <Button onClick={leaveReviewEnvironment} style={{ background: '#fff', color: '#1E6B50' }}>返回普通登录</Button>
  </View>;
}
