import React, { useEffect, useState } from 'react';
import { View, Text, Button } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import PurchaseModal from '../../../components/PurchaseModal';
import { useAuth } from '../../../context/AuthContext';
import { servicesAPI } from '../../../services/api';

export default function Join365Page() {
  const { params } = useRouter();
  const productId = params.productId;
  const { user, loading } = useAuth();
  const [plan, setPlan] = useState(null);
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (loading) return;
    if (!user?.onboardingCompleted) {
      Taro.setStorageSync('jy_post_login_url', '/pages/services/join365/index?productId=' + encodeURIComponent(productId || ''));
      Taro.redirectTo({ url: user ? '/pages/onboarding/index' : '/pages/auth/login/index' });
      return;
    }
    let active = true;
    setPlan(null);
    setMessage('');
    servicesAPI.packages().then(result => {
      if (!active) return;
      if (!result.success) throw new Error();
      const eligible = (result.data || []).find(item => item.id === productId && item.canJoin365 === true
        && item.membershipTier === 'consumer365' && item.includes365 && Number(item.durationMonths) === 12);
      if (eligible) setPlan({ ...eligible, servicePackage: true, fulfillmentType: 'subscription_service' });
      else setMessage('当前账户暂无可开通的365健康会员计划');
    }).catch(() => { if (active) setMessage('会员计划加载失败，请重试'); });
    return () => { active = false; };
  }, [loading, user?._id, user?.onboardingCompleted, productId, attempt]);

  const close = () => Taro.switchTab({ url: '/pages/home/index' });
  if (plan && user?.onboardingCompleted) return <PurchaseModal item={plan} mode="pay" selfMembership onClose={close} />;
  return (
    <View style={{ padding: '72px 24px' }}>
      <Text>{message || '正在加载365健康会员计划…'}</Text>
      {message && <Button onClick={() => setAttempt(previous => previous + 1)}>重新加载</Button>}
      <Button onClick={close}>返回首页</Button>
    </View>
  );
}
