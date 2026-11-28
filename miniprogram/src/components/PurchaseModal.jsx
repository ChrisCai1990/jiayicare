import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Textarea, ScrollView, Picker } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius } from '../theme';
import { servicesAPI, authAPI, userAPI, paymentsAPI, familyLinksAPI, guardianChildrenAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import useNavBar from '../hooks/useNavBar';
import { requestWechatPayment, waitForPayment } from '../utils/wechatPay';
import { maxFundDeduction } from '../utils/healthFundCheckout';

export function Stars({ rating }) {
  const r = Math.round(rating || 5);
  return (
    <Text style={{ fontSize: '11px', color: '#F39C12', fontWeight: 700 }}>
      {'★'.repeat(r)}{'☆'.repeat(5 - r)} {rating}
    </Text>
  );
}

const PAY_METHODS = [
  { key: 'wechat_pay', label: '微信支付' },
];

function formatCouponLabel(c) {
  return c.title || (c.type === 'amount' ? `¥${c.value}抵用券` : `${c.value / 10}折优惠券`);
}

export default function PurchaseModal({ item, mode, onClose, shareToken = '', partnerCode = '', initialSpecificationLabel = '', initialBeneficiaryUserId = '', selfMembership = false, pushRecordId = '' }) {
  const { statusBarHeight, navBarHeight, totalHeight } = useNavBar();
  const { user, updateUser } = useAuth();
  const isPay = mode === 'pay';
  const [note, setNote] = useState('');
  const [desiredServiceDate, setDesiredServiceDate] = useState('');
  const [serviceRequirements, setServiceRequirements] = useState('');
  const [payMethod, setPayMethod] = useState('wechat_pay');
  const [serviceAgreed, setServiceAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const pendingOrderRef = useRef(null);
  const [submitted, setSubmitted] = useState(false);
  const [submittedPackage, setSubmittedPackage] = useState(false);
  const [packageRedemptionAt, setPackageRedemptionAt] = useState('service_start');
  const [errMsg, setErrMsg] = useState('');
  const hasSpecs = !!(item?.servicePrices && item.servicePrices.length > 0);
  const [specIdx, setSpecIdx] = useState(() => Math.max(0, (item?.servicePrices || []).findIndex(row => row.label === initialSpecificationLabel)));

  const [checkoutUser, setCheckoutUser] = useState(null);
  const fundBalance = checkoutUser?.healthFund?.total || 0;
  const personalFund = checkoutUser?.healthFund?.personal || 0;
  const vitalityFund = checkoutUser?.healthFund?.vitality || 0;
  const corporateFund = checkoutUser?.healthFund?.corporate || 0;
  const fundRuleDescription = checkoutUser?.healthFund?.rule?.description || '';
  const [useFund, setUseFund] = useState(false);
  const [useSharedFund, setUseSharedFund] = useState(false);
  const [sharedQuote, setSharedQuote] = useState(0);
  const [coupons, setCoupons] = useState([]);
  const [couponId, setCouponId] = useState(null);
  const [benefitsLoading, setBenefitsLoading] = useState(false);
  const [benefitsError, setBenefitsError] = useState('');
  const [benefitsRefresh, setBenefitsRefresh] = useState(0);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [beneficiariesLoaded, setBeneficiariesLoaded] = useState(false);
  const [beneficiaryUserId, setBeneficiaryUserId] = useState(initialBeneficiaryUserId);
  const selectedBeneficiary = beneficiaries.find(person => person.id === beneficiaryUserId);
  const familyPayment = !!beneficiaryUserId;

  useEffect(() => {
    if (!item || selfMembership) return;
    let live = true;
    Promise.all([familyLinksAPI.list(), guardianChildrenAPI.list()]).then(([family, children]) => {
      if (!live) return;
      const adults = (family.data || []).filter(link => link.user?._id).map(link => ({ id: String(link.user._id), name: link.user.name, relation: link.relation }));
      const minors = (children.data || []).filter(child => child.id).map(child => ({ id: String(child.id), name: child.name, relation: '孩子' }));
      setBeneficiaries([...adults, ...minors]);
      setBeneficiariesLoaded(true);
    }).catch(() => { if (live) { setBeneficiaries([]); setBeneficiariesLoaded(true); } });
    return () => { live = false; };
  }, [item?.id, selfMembership]);

  useEffect(() => {
    if (!isPay) return;
    setBenefitsLoading(true);
    setBenefitsError('');
    let live = true;
    Promise.all([
      servicesAPI.coupons().catch(() => ({ success: false })),
      userAPI.getMe().catch(() => ({ success: false })),
    ]).then(([couponRes, userRes]) => {
      if (!live) return;
      if (couponRes.success) setCoupons(couponRes.data || []);
      if (userRes.success) { setCheckoutUser(userRes.data); updateUser(userRes.data); }
      if (!couponRes.success || !userRes.success) setBenefitsError('部分优惠权益加载失败，点击重试');
    }).finally(() => { if (live) setBenefitsLoading(false); });
    return () => { live = false; };
  }, [isPay, benefitsRefresh]);

  const currentPrice = hasSpecs
    ? (!familyPayment && item.servicePrices[specIdx]?.partnerSelfPrice != null
      ? item.servicePrices[specIdx].partnerSelfPrice : item.servicePrices[specIdx]?.price ?? item.price)
    : (!familyPayment && item.partnerSelfPrice != null ? item.partnerSelfPrice : item.price);
  const currentSpecLabel = hasSpecs ? item.servicePrices[specIdx]?.label : '';
  const selectedSku = (item.skus || []).find((sku) => sku.label === currentSpecLabel && sku.active !== false);
  const fulfillmentType = selectedSku?.fulfillmentType || item.fulfillmentType || 'offline_service';
  const requiresServiceDetails = isPay && ['offline_service', 'remote_service'].includes(fulfillmentType);

  const selectedCoupon = coupons.find((c) => c._id === couponId) || null;
  const couponDiscount = selectedCoupon
    ? Math.min(selectedCoupon.type === 'amount' ? selectedCoupon.value : Math.round(currentPrice * (100 - selectedCoupon.value)) / 100, currentPrice)
    : 0;
  const priceAfterCoupon = Math.max(0, Math.round((currentPrice - couponDiscount) * 100) / 100);
  useEffect(() => {
    if (!isPay || !item?.id || !priceAfterCoupon) { setSharedQuote(0); return; }
    let live = true;
    setSharedQuote(0);
    userAPI.enterpriseSharedFundQuote(item.id, priceAfterCoupon).then(r => { if (live) setSharedQuote(Number(r.data?.amount || 0)); }).catch(() => { if (live) setSharedQuote(0); });
    return () => { live = false; };
  }, [isPay, item?.id, priceAfterCoupon, benefitsRefresh]);
  const fundMaximum = maxFundDeduction(checkoutUser?.healthFund, priceAfterCoupon, item, currentSpecLabel);
  const canUseFund = fundBalance > 0 && fundMaximum > 0;
  const fundApplied = canUseFund && useFund ? Math.round(Math.min(fundBalance, fundMaximum) * 100) / 100 : 0;
  const sharedApplied = useSharedFund ? sharedQuote : 0;
  const finalPrice = Math.max(0, Math.round((priceAfterCoupon - fundApplied - sharedApplied) * 100) / 100);

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    if (beneficiaryUserId && !selectedBeneficiary) { setErrMsg(beneficiariesLoaded ? '当前档案关联已失效，请重新选择服务对象' : '家庭成员信息加载中，请稍后重试'); return; }
    if (requiresServiceDetails && !desiredServiceDate) { setErrMsg('请选择期望服务时间'); return; }
    if (requiresServiceDetails && !serviceRequirements.trim()) { setErrMsg('请填写具体服务需求'); return; }
    if (!serviceAgreed) { setErrMsg('请先阅读并同意《健康管理服务说明》'); return; }
    submittingRef.current = true;
    setSubmitting(true); setErrMsg('');
    try {
      // Always refresh the payer OpenID from the current WeChat session before
      // creating a payment. A stored OpenID may belong to an earlier tester and
      // causes WeChat to reject the payment as payer/order-account mismatch.
      if (isPay && finalPrice > 0) {
        const bound = await authAPI.bindWechat();
        if (!bound.success) throw new Error(bound.message || '微信身份绑定失败');
        // 微信绑定接口只负责刷新支付 OpenID。保留结算页刚从 /user/me
        // 加载的基金规则，否则绑定返回的余额汇总会把“每单 10%”误当成
        // 无限制抵扣，支付取消后页面就会从 ¥28 跳成 ¥280。
        const boundUser = {
          ...bound.data,
          healthFund: {
            ...(checkoutUser?.healthFund || {}),
            ...(bound.data?.healthFund || {}),
            eligible: checkoutUser?.healthFund?.eligible,
            enterprise: checkoutUser?.healthFund?.enterprise,
            policy: checkoutUser?.healthFund?.policy,
            rule: checkoutUser?.healthFund?.rule,
          },
        };
        setCheckoutUser(boundUser);
        updateUser(boundUser);
      }
      const noteWithSpec = [currentSpecLabel ? `规格：${currentSpecLabel}（¥${currentPrice}）` : '', note.trim()].filter(Boolean).join('；');
      const checkoutKey = JSON.stringify([beneficiaryUserId, pushRecordId, currentSpecLabel, familyPayment ? null : couponId, fundApplied, sharedApplied, finalPrice, desiredServiceDate, serviceRequirements.trim(), note.trim()]);
      if (isPay && pendingOrderRef.current && pendingOrderRef.current.key !== checkoutKey) {
        throw new Error('已有待支付订单；如需修改，请先到“我的订单”取消原订单后重新购买');
      }
      const res = isPay
        ? (pendingOrderRef.current
          ? await paymentsAPI.retry(pendingOrderRef.current.id)
          : await servicesAPI.order(item.id, noteWithSpec, payMethod, fundApplied, familyPayment ? null : couponId, currentSpecLabel || undefined, shareToken, desiredServiceDate, serviceRequirements.trim(), finalPrice, familyPayment ? false : useSharedFund, beneficiaryUserId, pushRecordId, partnerCode))
        : await servicesAPI.inquire(item.id, note.trim(), currentSpecLabel || undefined, beneficiaryUserId);
      if (res.success) {
        if (res.data?.packageCovered) {
          setSubmittedPackage(true);
          setPackageRedemptionAt(res.data.packageRedemptionAt || 'service_start');
        }
        const orderId = res.data?.orderId || res.data?.order?._id || pendingOrderRef.current?.id;
        if (isPay && orderId) pendingOrderRef.current = { id: orderId, key: checkoutKey };
        if (res.data?.paymentParams) {
          await requestWechatPayment(res.data.paymentParams);
          await waitForPayment(orderId);
        } else if (isPay && !res.data?.alreadyPaid && res.data?.paymentStatus !== 'paid') {
          throw new Error('付款结果待确认，请稍后在“我的订单”查看');
        }
        setSubmitted(true);
        if (selfMembership) userAPI.getMe().then(result => {
          if (result.success) updateUser(result.data);
        }).catch(() => {});
      }
      else setErrMsg(res.message || '提交失败，请重试');
    } catch (e) {
      setErrMsg(e.message || '网络错误，请检查连接后重试');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
        <View style={{ backgroundColor: '#fff', borderRadius: '28px 28px 0 0', width: '100%', boxSizing: 'border-box', padding: `${spacing.lg}px`, textAlign: 'center' }}>
          <Text style={{ fontSize: '44px', display: 'block', margin: '16px 0' }}>✅</Text>
          <Text style={{ fontSize: '20px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>{submittedPackage ? '已使用套餐权益' : isPay ? '支付已完成' : '预约申请已提交'}</Text>
          <Text style={{ fontSize: '14px', color: colors.textSecondary, lineHeight: '22px', display: 'block', marginBottom: `${spacing.xl}px` }}>
            {submittedPackage ? `本次服务已预占套餐次数，无需再次付费。${packageRedemptionAt === 'order_completion' ? '分次服务全部完成后' : '实际服务启动后'}将自动核销。可在“我的订单”查看进度。` : selfMembership ? '365健康会员套餐已付款，可在“我的”查看会员权益。' : isPay
              ? `¥${finalPrice} 的订单已提交${finalPrice > 0 ? '并完成微信支付' : '（已用健康基金/优惠券全额抵扣）'}。健管师将与您联系预约具体服务时间，可在"我的订单"查看进度。`
              : '健管师将在 1-2 个工作日内与您联系，请保持手机畅通。'}
          </Text>
          <View onClick={onClose} style={{ backgroundColor: colors.primary, borderRadius: `${radius.md}px`, padding: '14px' }}>
            <Text style={{ fontSize: '16px', color: '#fff', fontWeight: 700 }}>知道了</Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{position:'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'#fff',zIndex:100}}>
    <View style={{position:'relative',zIndex:2,paddingTop:`${statusBarHeight}px`,height:`${totalHeight}px`,boxSizing:'border-box',backgroundColor:'#fff'}}>
      <View onClick={(event) => { event.stopPropagation(); onClose(); }} style={{position:'relative',zIndex:3,height:`${navBarHeight}px`,display:'flex',alignItems:'center',paddingLeft:'20px',width:'120px'}}><Text style={{fontSize:'17px',color:colors.primary}}>{selfMembership ? '‹ 返回首页' : '‹ 返回商城'}</Text></View>
    </View>
    <ScrollView scrollY enhanced showScrollbar style={{ position: 'absolute', zIndex: 1, top: `${totalHeight}px`, left: 0, right: 0, bottom: 0, width: '100%', height: `calc(100vh - ${totalHeight}px)`, backgroundColor: '#fff' }}>
      <View style={{ padding: `${spacing.lg}px`, paddingBottom: '40px', width: '100%', minHeight: '100vh', boxSizing: 'border-box' }}>
        <View style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: colors.border, margin: '0 auto 16px' }} />
        <View>
          <View style={{ display: 'flex', gap: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
            <View style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: colors.primary10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Text style={{ fontSize: '26px' }}>🏪</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block' }} numberOfLines={2}>{item.name}</Text>
              <Stars rating={item.rating || 5} />
            </View>
          </View>

          {hasSpecs ? (
            <View style={{ backgroundColor: colors.background, borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
              <Text style={{ fontSize: '14px', color: colors.textSecondary, display: 'block', marginBottom: '8px' }}>选择规格</Text>
              {item.servicePrices.map((sp, i) => {
                const active = i === specIdx;
                return (
                  <View key={i} onClick={() => setSpecIdx(i)} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', boxSizing: 'border-box',
                    padding: '10px 12px', borderRadius: `${radius.md}px`, marginBottom: '8px',
                    border: `1.5px solid ${active ? colors.primary : colors.border}`, backgroundColor: active ? colors.primary10 : '#fff',
                  }}>
                    <Text style={{ fontSize: '14px', color: colors.textPrimary, fontWeight: active ? 700 : 500 }}>{sp.label}</Text>
                    <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.danger }}>¥{!familyPayment && sp.partnerSelfPrice != null ? sp.partnerSelfPrice : sp.price}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.background, borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
              <Text style={{ fontSize: '14px', color: colors.textSecondary }}>{!familyPayment && item.partnerSelfPrice != null ? '合伙人自购价' : '服务费用'}</Text>
              <View>
                {item.price < item.originalPrice && <Text style={{ fontSize: '12px', color: colors.textMuted, textDecoration: 'line-through', marginRight: '6px' }}>¥{item.originalPrice}</Text>}
                <Text style={{ fontSize: '22px', fontWeight: 800, color: colors.danger }}>¥{currentPrice}</Text>
              </View>
            </View>
          )}

          {item.features && item.features.length > 0 && (
            <View style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: `${spacing.md}px` }}>
              {item.features.map((f, i) => (
                <Text key={i} style={{ fontSize: '12px', color: colors.primary, backgroundColor: colors.primary10, padding: '4px 10px', borderRadius: `${radius.full}px` }}>✓ {f}</Text>
              ))}
            </View>
          )}

          <View style={{ backgroundColor: colors.background, borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
            <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>服务对象</Text>
            <Picker mode="selector" disabled={selfMembership || !!pushRecordId} range={[`本人${user?.name ? ` · ${user.name}` : ''}`, ...beneficiaries.map(person => `${person.name} · ${person.relation || '家庭成员'}`)]}
              value={Math.max(0, beneficiaries.findIndex(person => person.id === beneficiaryUserId) + 1)}
              onChange={event => { const index = Number(event.detail.value); setBeneficiaryUserId(index > 0 ? beneficiaries[index - 1]?.id || '' : ''); setCouponId(null); setUseFund(false); setUseSharedFund(false); }}>
              <View style={{ padding: '12px', border: `1px solid ${colors.border}`, borderRadius: `${radius.md}px`, backgroundColor: '#fff' }}>
                <Text style={{ color: colors.primary }}>{selectedBeneficiary ? `${selectedBeneficiary.name} · ${selectedBeneficiary.relation || '家庭成员'}` : beneficiaryUserId ? '关联家人加载中' : `本人${user?.name ? ` · ${user.name}` : ''}`} ›</Text>
              </View>
            </Picker>
            <Text style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginTop: '8px' }}>服务需求和后续跟进归属所选成员；{isPay ? '本次微信支付由您完成。' : '工作人员将按该成员的归属联系。'}</Text>
            {familyPayment && isPay && <Text style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginTop: '4px' }}>为家人支付暂不使用您的基金或抵用券。</Text>}
          </View>

          {isPay && (
            <>
              <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary }}>支付方式</Text>
                <Text style={{ fontSize: '10px', color: colors.textMuted }}>结算 v1.0.22</Text>
              </View>
              <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginBottom: `${spacing.md}px` }}>
                {PAY_METHODS.map((m) => (
                  <View key={m.key} onClick={() => setPayMethod(m.key)} style={{
                    flex: 1, textAlign: 'center', padding: '12px 0', borderRadius: `${radius.md}px`,
                    border: `1.5px solid ${payMethod === m.key ? colors.primary : colors.border}`,
                    backgroundColor: payMethod === m.key ? colors.primary10 : '#fff',
                  }}>
                    <Text style={{ fontSize: '14px', color: payMethod === m.key ? colors.primary : colors.textMuted, fontWeight: payMethod === m.key ? 700 : 600 }}>{m.label}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {isPay && (
            <>
              <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>抵用券</Text>
              <View style={{ marginBottom: `${spacing.md}px` }}>
                {benefitsLoading && <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: '8px' }}>正在加载可用抵用券...</Text>}
                {!benefitsLoading && coupons.length === 0 && <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: '8px' }}>当前账户暂无可用抵用券</Text>}
                <View onClick={() => setCouponId(null)} style={{ padding: '10px 12px', borderRadius: `${radius.md}px`, border: `1.5px solid ${!couponId ? colors.primary : colors.border}`, backgroundColor: !couponId ? colors.primary10 : '#fff', marginBottom: '8px' }}>
                  <Text style={{ fontSize: '13px', color: !couponId ? colors.primary : colors.textSecondary, fontWeight: !couponId ? 700 : 500 }}>不使用优惠券</Text>
                </View>
                {coupons.map((c) => (
                  <View key={c._id} onClick={() => setCouponId(c._id)} style={{ padding: '10px 12px', borderRadius: `${radius.md}px`, border: `1.5px solid ${couponId === c._id ? colors.primary : colors.border}`, backgroundColor: couponId === c._id ? colors.primary10 : '#fff', marginBottom: '8px' }}>
                    <Text style={{ fontSize: '13px', color: couponId === c._id ? colors.primary : colors.textSecondary, fontWeight: couponId === c._id ? 700 : 500 }}>
                      {formatCouponLabel(c)}{c.minSpend > 0 ? `（满¥${c.minSpend}可用）` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {isPay && canUseFund && (
            <>
              <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary }}>健康基金抵扣（余额¥{fundBalance.toFixed(2)}）</Text>
                <View onClick={() => {
                  const next = !useFund;
                  setUseFund(next); if (next) setUseSharedFund(false);
                }} style={{ padding: '6px 12px', borderRadius: `${radius.full}px`, border: `1.5px solid ${useFund ? colors.primary : colors.border}`, backgroundColor: useFund ? colors.primary : '#fff' }}>
                  <Text style={{ fontSize: '12px', fontWeight: 600, color: useFund ? '#fff' : colors.textSecondary }}>{useFund ? '已启用' : '使用基金'}</Text>
                </View>
              </View>
              {useFund && (
                <>
                  <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: '6px' }}>自有 ¥{personalFund.toFixed(2)} · 活力 ¥{vitalityFund.toFixed(2)} · 奖励 ¥{corporateFund.toFixed(2)}</Text>
                  {!!fundRuleDescription && <Text style={{ fontSize: '11px', color: colors.textSecondary, lineHeight: '17px', display: 'block', marginBottom: '8px' }}>使用规则：{fundRuleDescription}</Text>}
                  <Text style={{ fontSize: '12px', color: colors.primary, display: 'block', marginBottom: `${spacing.md}px` }}>本单自动抵扣 ¥{fundMaximum.toFixed(2)}</Text>
                </>
              )}
            </>
          )}

          {isPay && sharedQuote > 0 && <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <Text style={{ fontSize: '13px', color: colors.textPrimary }}>企业共享基金 · 本单可抵 ¥{sharedQuote.toFixed(2)}（最高 50%）</Text>
            <View onClick={() => { const next = !useSharedFund; setUseSharedFund(next); if (next) setUseFund(false); }} style={{ padding: '6px 12px', borderRadius: `${radius.full}px`, border: `1px solid ${useSharedFund ? colors.primary : colors.border}` }}><Text>{useSharedFund ? '已启用' : '使用'}</Text></View>
          </View>}

          {isPay && !benefitsLoading && !canUseFund && (
            <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: `${spacing.md}px` }}>{benefitsError ? '基金资格暂未核实，请重试加载' : `基金余额 ¥${fundBalance.toFixed(2)}；${checkoutUser?.healthFund?.eligible === false ? '当前会员计划资格未通过，请联系团队核对' : '本商品按当前抵扣规则暂无可用额度'}`}</Text>
          )}
          {isPay && benefitsError && (
            <Text onClick={() => setBenefitsRefresh(n => n + 1)} style={{ fontSize: '12px', color: colors.danger, display: 'block', marginBottom: `${spacing.md}px` }}>{benefitsError}</Text>
          )}

          {isPay && (couponDiscount > 0 || fundApplied > 0 || sharedApplied > 0) && (
            <View style={{ backgroundColor: colors.background, borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
              <View style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <Text style={{ fontSize: '13px', color: colors.textSecondary }}>{!familyPayment && (item.partnerSelfPrice != null || item.servicePrices?.[specIdx]?.partnerSelfPrice != null) ? '合伙人自购价' : '商品原价'}</Text>
                <Text style={{ fontSize: '13px', color: colors.textPrimary, fontWeight: 600 }}>¥{currentPrice}</Text>
              </View>
              {couponDiscount > 0 && (
                <View style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <Text style={{ fontSize: '13px', color: colors.textSecondary }}>优惠券抵扣</Text>
                  <Text style={{ fontSize: '13px', color: colors.danger, fontWeight: 600 }}>-¥{couponDiscount}</Text>
                </View>
              )}
              {fundApplied > 0 && (
                <View style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <Text style={{ fontSize: '13px', color: colors.textSecondary }}>健康基金抵扣</Text>
                  <Text style={{ fontSize: '13px', color: colors.danger, fontWeight: 600 }}>-¥{fundApplied.toFixed(2)}</Text>
                </View>
              )}
              {sharedApplied > 0 && <View style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><Text>企业共享基金抵扣</Text><Text>-¥{sharedApplied.toFixed(2)}</Text></View>}
              <View style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${colors.border}`, paddingTop: '6px', marginTop: '2px' }}>
                <Text style={{ fontSize: '13px', color: colors.textPrimary, fontWeight: 700 }}>应付金额</Text>
                <Text style={{ fontSize: '18px', color: colors.danger, fontWeight: 800 }}>¥{finalPrice.toFixed(2)}</Text>
              </View>
            </View>
          )}

          {requiresServiceDetails && <>
            <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>期望服务时间 *</Text>
            <Picker mode="date" value={desiredServiceDate} start={new Date().toISOString().slice(0, 10)} onChange={(e) => { setDesiredServiceDate(e.detail.value); setErrMsg(''); }}>
              <View style={{ padding: '13px 14px', backgroundColor: colors.background, borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, marginBottom: `${spacing.md}px` }}><Text style={{ color: desiredServiceDate ? colors.textPrimary : colors.textMuted }}>{desiredServiceDate || '请选择日期'} ›</Text></View>
            </Picker>
            <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>具体服务需求 *</Text>
            <Textarea style={{ width: '100%', boxSizing: 'border-box', backgroundColor: colors.background, borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, padding: `${spacing.md}px`, fontSize: '14px', minHeight: '90px', marginBottom: `${spacing.md}px` }} placeholder="请填写服务地点、时间段及具体需求" value={serviceRequirements} onInput={(e) => { setServiceRequirements(e.detail.value); setErrMsg(''); }} maxlength={1000} />
          </>}

          <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>备注（可选）</Text>
          <Textarea
            style={{ width: '100%', boxSizing: 'border-box', backgroundColor: colors.background, borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, padding: `${spacing.md}px`, fontSize: '14px', minHeight: '70px', marginBottom: `${spacing.sm}px` }}
            placeholder="如有特殊需求，请在此说明"
            value={note}
            onInput={(e) => setNote(e.detail.value)}
          />

          {!!errMsg && <Text style={{ fontSize: '13px', color: colors.danger, display: 'block', textAlign: 'center', marginBottom: `${spacing.sm}px` }}>{errMsg}</Text>}

          <Text style={{ fontSize: '11px', color: colors.textMuted, lineHeight: '16px', display: 'block', marginBottom: `${spacing.lg}px` }}>
            {isPay ? '提交后将拉起微信支付，支付结果以微信服务端确认为准，可在“我的订单”查看' : '提交后，健管师将与您联系确认具体服务安排'}
          </Text>
          <View onClick={() => setServiceAgreed(!serviceAgreed)} style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', marginBottom: `${spacing.md}px` }}>
            <Text style={{ color: serviceAgreed ? colors.primary : colors.textMuted }}>{serviceAgreed ? '☑' : '☐'}</Text>
            <Text style={{ flex: 1, fontSize: '11px', color: colors.textSecondary, lineHeight: '17px' }}>
              我已阅读并同意<Text style={{ color: colors.primary }} onClick={(e) => { e.stopPropagation && e.stopPropagation(); Taro.navigateTo({ url: '/pages/legal/index?type=service' }); }}>《健康管理服务说明》</Text>，知悉本服务不提供诊断、治疗、处方或检查开单。
            </Text>
          </View>
        </View>

        <View style={{ display: 'flex', gap: `${spacing.sm}px` }}>
          <View onClick={onClose} style={{ flex: 1, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.border}` }}>
            <Text style={{ fontSize: '15px', color: colors.textSecondary, fontWeight: 600 }}>取消</Text>
          </View>
          <View onClick={submitting ? undefined : handleSubmit} style={{ flex: 2, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary, opacity: submitting || !serviceAgreed ? 0.6 : 1 }}>
            <Text style={{ fontSize: '15px', color: '#fff', fontWeight: 700 }}>{submitting ? '提交中...' : (isPay ? `确认支付 ¥${finalPrice.toFixed(2)}` : '提交预约')}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
    </View>
  );
}
