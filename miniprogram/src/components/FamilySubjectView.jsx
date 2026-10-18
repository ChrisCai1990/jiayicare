import React, { useEffect, useState } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius } from '../theme';
import { authAPI, familyLinksAPI, ordersAPI, messagesAPI, paymentsAPI, pushRecordsAPI } from '../services/api';
import { getOrderBadgeCounts } from '../utils/orderStatus';
import { requestWechatPayment, waitForPayment } from '../utils/wechatPay';

const card = { backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: '16px', marginBottom: '12px', border: `1px solid ${colors.border}` };
const action = { color: colors.primary, fontSize: '13px', fontWeight: 700 };
const nav = url => Taro.navigateTo({ url });

function FamilyProductPushDetail({ msg, memberName, onClose }) {
  const items = msg.products?.length ? msg.products : msg.productId ? [{ productId: msg.productId, name: msg.productName, price: msg.price }] : [];
  const [chosen, setChosen] = useState(() => items.map(item => String(item.productId)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const amount = items.filter(item => chosen.includes(String(item.productId))).reduce((sum, item) => sum + Number(item.price || 0), 0);
  const pay = async () => {
    if (!chosen.length || busy) return;
    setBusy(true); setError('');
    let orderId = '';
    try {
      const bound = await authAPI.bindWechat();
      if (!bound.success) throw new Error(bound.message || '微信身份绑定失败');
      const result = await pushRecordsAPI.pay(msg._id, { selectedProductIds: chosen, beneficiaryUserId: msg.beneficiaryUserId, useHealthFund: 0, useEnterpriseSharedFund: false, couponId: null, paymentMethod: 'wechat', paymentCapability: 'wechat_jsapi_v1', expectedAmount: amount });
      if (!result.success) throw new Error(result.message || '下单失败');
      orderId = result.data?.orderId || '';
      if (result.data?.paymentParams) {
        await requestWechatPayment(result.data.paymentParams);
        await waitForPayment(orderId);
      } else if (result.data?.paymentStatus !== 'paid') throw new Error('支付信息未返回，请前往订单页继续支付');
      Taro.showToast({ title: '支付成功', icon: 'success' });
      onClose();
    } catch (err) {
      setError(`${err.message || '支付失败'}${orderId ? '，已生成待支付订单' : ''}`);
    } finally { setBusy(false); }
  };
  return <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
    <View style={{ backgroundColor: '#fff', borderRadius: '24px 24px 0 0', padding: '22px', width: '100%', boxSizing: 'border-box' }}>
      <Text style={{ display: 'block', fontSize: '18px', fontWeight: 700, marginBottom: '6px' }}>为{memberName}购买服务</Text>
      <Text style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginBottom: '12px' }}>订单归属{memberName}，由当前登录账号微信支付</Text>
      {items.map(item => <View key={String(item.productId)} onClick={() => setChosen(previous => previous.includes(String(item.productId)) ? previous.filter(id => id !== String(item.productId)) : [...previous, String(item.productId)])} style={{ padding: '12px 0', borderBottom: `1px solid ${colors.borderLight}` }}><Text style={{ fontSize: '14px' }}>{chosen.includes(String(item.productId)) ? '☑' : '□'} {item.name} · ¥{item.price}</Text></View>)}
      <Text style={{ display: 'block', marginTop: '14px', fontWeight: 700 }}>合计 ¥{amount.toFixed(2)}</Text>
      {!!error && <Text style={{ display: 'block', marginTop: '8px', color: colors.danger, fontSize: '12px' }}>{error}</Text>}
      <View style={{ display: 'flex', gap: '10px', marginTop: '18px' }}>
        <Text onClick={onClose} style={{ flex: 1, textAlign: 'center', padding: '12px', border: `1px solid ${colors.border}`, borderRadius: '10px' }}>关闭</Text>
        <Text onClick={pay} style={{ flex: 1, textAlign: 'center', padding: '12px', backgroundColor: colors.primary, color: '#fff', borderRadius: '10px' }}>{busy ? '支付中…' : '微信支付'}</Text>
      </View>
    </View>
  </View>;
}

export default function FamilySubjectView({ archive, section, statusBarHeight = 0 }) {
  const member = archive.subject;
  const memberId = String(member?.id || '');
  const [overview, setOverview] = useState(null);
  const [orders, setOrders] = useState([]);
  const [pushes, setPushes] = useState([]);
  const [plannerMessages, setPlannerMessages] = useState([]);
  const [selectedPush, setSelectedPush] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [payingOrderId, setPayingOrderId] = useState('');

  const payFamilyOrder = async row => {
    if (payingOrderId || !row.payable) return;
    const confirmation = await Taro.showModal({ title: '确认代付', content: `为${member.name}支付「${row.serviceName}」¥${Number(row.amount).toFixed(2)}？`, confirmText: '继续支付' });
    if (!confirmation.confirm) return;
    setPayingOrderId(String(row.id));
    let claimed = false;
    try {
      const bound = await authAPI.bindWechat();
      if (!bound.success) throw new Error(bound.message || '微信身份绑定失败');
      const claim = await ordersAPI.claimFamilyPayment(row.id);
      if (!claim?.success) throw new Error(claim?.message || '代付订单处理失败');
      claimed = true;
      const result = await paymentsAPI.retry(row.id);
      if (!result?.success) throw new Error(result?.message || '发起支付失败');
      if (result.data?.paymentParams) {
        await requestWechatPayment(result.data.paymentParams);
        await waitForPayment(row.id);
      } else if (!result.data?.alreadyPaid) throw new Error('付款结果待确认，请到订单页继续支付');
      Taro.showToast({ title: '支付成功', icon: 'success' });
      setRevision(value => value + 1);
    } catch (err) {
      if (claimed) {
        await Taro.showModal({ title: '订单已转入订单列表', content: `${err.message || '付款暂未完成'}。可在待支付订单继续支付。`, showCancel: false });
        nav('/pages/orders/index?tab=payment');
      } else Taro.showToast({ title: err.message || '代付失败', icon: 'none' });
    } finally { setPayingOrderId(''); }
  };

  useDidShow(() => setRevision(value => value + 1));
  useEffect(() => {
    if (!memberId) return undefined;
    let live = true;
    setLoading(true); setError(''); setOverview(null); setOrders([]); setPushes([]); setPlannerMessages([]);
    const requests = [familyLinksAPI.serviceOverview(memberId), ordersAPI.list()];
    if (section === 'manager') requests.push(pushRecordsAPI.list(memberId), messagesAPI.list());
    Promise.allSettled(requests).then(results => {
      if (!live) return;
      const value = index => results[index]?.status === 'fulfilled' && results[index].value?.success ? results[index].value.data : null;
      const summary = value(0);
      if (!summary) setError('家庭成员服务信息加载失败，点击重试');
      setOverview(summary);
      const orderRows = value(1);
      setOrders(Array.isArray(orderRows) ? orderRows.filter(row => String(row.user?._id || row.user) === memberId) : []);
      if (section === 'manager') {
        const pushRows = value(2);
        setPushes(Array.isArray(pushRows) ? pushRows.filter(row => row.type === 'product') : []);
        const messageRows = value(3);
        setPlannerMessages(Array.isArray(messageRows) ? messageRows.filter(row =>
          row.type === 'planner' && String(row.action?.beneficiaryUserId || '') === memberId) : []);
      }
      setLoading(false);
    });
    return () => { live = false; };
  }, [memberId, section, revision]);

  if (archive.loading) return <View style={{ padding: '24px' }}>正在核对家庭成员…</View>;
  if (archive.error) return <View style={{ padding: '24px' }}><Text onClick={archive.refresh} style={{ color: colors.danger }}>{archive.error} · 点击重试</Text></View>;
  if (!member) return null;

  const counts = getOrderBadgeCounts(orders);
  const heading = section === 'home' ? '首页' : section === 'manager' ? '健康管家' : '我的';
  const recommendations = overview?.recommendations || [];
  const appointments = overview?.appointments || [];
  const pendingPayments = overview?.pendingPayments || [];
  const displayPush = row => ({
    _id: row._id, type: 'product', isPushRecord: true, sender: row.staffId?.name || '健康管理团队',
    title: '产品推送', content: row.content || '', productName: row.title || '', price: row.price,
    productId: row.productId, products: row.products || [], fundProduct: row.fundProduct,
    beneficiaryUserId: memberId, createdAt: row.createdAt,
  });

  return <View style={{ minHeight: '100vh', backgroundColor: colors.background, padding: `${statusBarHeight + 12}px ${spacing.lg}px ${spacing.xl}px`, boxSizing: 'border-box' }}>
    <Text style={{ display: 'block', fontSize: '20px', fontWeight: 800, color: colors.textPrimary, marginBottom: '12px' }}>{heading}</Text>
    <View style={{ ...card, backgroundColor: '#E8F5EF', borderColor: '#B5D8C8' }}>
      <Text style={{ display: 'block', fontSize: '17px', fontWeight: 700, color: colors.primary }}>{member.name} · {member.kind === 'child' ? '孩子' : '家人'}</Text>
      <Text style={{ display: 'block', fontSize: '12px', color: colors.textSecondary, marginTop: '5px' }}>当前查看与处理的是该成员的健康服务</Text>
      <Text onClick={() => archive.select(0)} style={{ ...action, display: 'block', marginTop: '10px' }}>切回本人 ›</Text>
    </View>
    {error && <Text onClick={() => setRevision(value => value + 1)} style={{ display: 'block', color: colors.danger, marginBottom: '12px' }}>{error}</Text>}
    {loading ? <Text style={{ color: colors.textMuted }}>加载中…</Text> : <>
      {section === 'home' && <>
        <View style={card}>
          <Text style={{ display: 'block', fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>服务进展</Text>
          <Text style={{ display: 'block', fontSize: '13px', color: colors.textSecondary }}>进行中的服务：{overview?.service?.activeCount ?? 0} 项</Text>
          {!!overview?.service?.latestServiceName && <Text style={{ display: 'block', fontSize: '13px', color: colors.textSecondary, marginTop: '6px' }}>{overview.service.latestServiceName} · {overview.service.latestStatus}</Text>}
          <Text onClick={() => nav('/pages/orders/index')} style={{ ...action, display: 'block', marginTop: '10px' }}>查看{member.name}的订单 ›</Text>
        </View>
        {appointments.length > 0 && <View style={card}>
          <Text style={{ display: 'block', fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>服务安排</Text>
          {appointments.map((item, index) => <Text key={index} style={{ display: 'block', fontSize: '13px', marginTop: '5px' }}>{item.serviceName} · {item.status}</Text>)}
        </View>}
        <View style={card}>
          <Text style={{ display: 'block', fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>健康档案</Text>
          <Text onClick={() => Taro.switchTab({ url: '/pages/records/index/index' })} style={{ ...action, display: 'block', marginBottom: '9px' }}>查看档案与报告 ›</Text>
          <Text onClick={() => nav('/pages/records/upload/index')} style={action}>上传报告 ›</Text>
        </View>
        {pendingPayments.length > 0 && <View style={card}>
          <Text style={{ display: 'block', fontSize: '16px', fontWeight: 700 }}>待支付服务</Text>
          {pendingPayments.map(row => <Text key={row.id} onClick={() => payFamilyOrder(row)} style={{ ...action, display: 'block', marginTop: '8px' }}>{row.serviceName} · ¥{row.amount} · {payingOrderId === String(row.id) ? '支付中…' : row.payable ? '立即支付 ›' : row.unavailableReason || '暂不可代付'}</Text>)}
        </View>}
        {recommendations.length > 0 && <View style={card}>
          <Text style={{ display: 'block', fontSize: '16px', fontWeight: 700 }}>服务推荐</Text>
          {recommendations.slice(0, 3).map((row, index) => <Text key={`${row.pushRecordId}:${index}`} onClick={() => Taro.switchTab({ url: '/pages/chat/index' })} style={{ ...action, display: 'block', marginTop: '8px' }}>{row.name} · ¥{row.quotedPrice} ›</Text>)}
        </View>}
      </>}
      {section === 'manager' && <>
        <View style={card}>
          <Text style={{ display: 'block', fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>AI健康规划师 · 服务订单消息</Text>
          {plannerMessages.length ? plannerMessages.map(row => <View key={row._id} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.borderLight}` }}><Text style={{ display: 'block', fontSize: '13px', fontWeight: 700 }}>{row.title || '订单服务确认'}</Text><Text style={{ display: 'block', fontSize: '13px', color: colors.textSecondary, lineHeight: '20px', marginTop: '5px' }}>{row.content}</Text></View>) : <Text style={{ color: colors.textMuted, fontSize: '13px' }}>暂无该成员的订单消息</Text>}
        </View>
        <View style={card}>
          <Text style={{ display: 'block', fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>服务产品推送</Text>
          {pushes.length ? pushes.map(row => <View key={row._id} onClick={() => setSelectedPush(displayPush(row))} style={{ padding: '10px 0', borderBottom: `1px solid ${colors.borderLight}` }}><Text style={{ display: 'block', fontSize: '14px', fontWeight: 700 }}>{row.title || '服务产品'}</Text><Text style={{ ...action, display: 'block', marginTop: '5px' }}>查看并支付 ›</Text></View>) : <Text style={{ color: colors.textMuted, fontSize: '13px' }}>暂无服务产品推送</Text>}
        </View>
        <Text style={{ display: 'block', fontSize: '12px', color: colors.textMuted, lineHeight: '18px' }}>此处显示该成员的订单沟通和产品推送。</Text>
      </>}
      {section === 'profile' && <>
        <View style={card}>
          <Text style={{ display: 'block', fontSize: '16px', fontWeight: 700, marginBottom: '8px' }}>{member.name}的服务</Text>
          <Text style={{ display: 'block', fontSize: '13px', color: colors.textSecondary }}>进行中 {overview?.service?.activeCount ?? 0} 项 · {overview?.service?.latestStatus || '暂无服务'}</Text>
          <Text onClick={() => nav('/pages/orders/index')} style={{ ...action, display: 'block', marginTop: '10px' }}>我代付的订单 {orders.length} 笔 · 待支付 {counts.payment || 0} 笔 ›</Text>
        </View>
        <View style={card}>
          <Text onClick={() => Taro.switchTab({ url: '/pages/records/index/index' })} style={{ ...action, display: 'block', marginBottom: '12px' }}>健康档案与报告 ›</Text>
          <Text onClick={() => nav('/pages/profile/family/index')} style={action}>家庭成员管理 ›</Text>
        </View>
        <View style={card}>
          <Text style={{ display: 'block', fontSize: '12px', color: colors.textMuted, marginBottom: '8px' }}>登录账号 · {archive.user?.name || '本人'}</Text>
          <Text onClick={() => nav('/pages/profile/security/index')} style={action}>账号安全与设置 ›</Text>
        </View>
      </>}
    </>}
    {selectedPush && <FamilyProductPushDetail msg={selectedPush} memberName={member.name} onClose={() => { setSelectedPush(null); setRevision(value => value + 1); }} />}
  </View>;
}
