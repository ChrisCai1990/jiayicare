import React, { useState, useEffect } from 'react';
import { View, Text, Textarea, ScrollView, Image, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { servicesAPI, authAPI, userAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';
import { requestWechatPayment, waitForPayment } from '../../../utils/wechatPay';

const PAY_METHODS = [
  { key: 'wechat_pay', label: '微信支付' },
];

function formatCouponLabel(c) {
  return c.title || (c.type === 'amount' ? `¥${c.value}抵用券` : `${c.value / 10}折优惠券`);
}

function Stars({ rating }) {
  const r = Math.round(rating || 5);
  return (
    <Text style={{ fontSize: '11px', color: '#F39C12', fontWeight: 700 }}>
      {'★'.repeat(r)}{'☆'.repeat(5 - r)} {rating}
    </Text>
  );
}

function ServiceCard({ item, onDetail, onPay }) {
  const windowWidth = Taro.getWindowInfo ? Taro.getWindowInfo().windowWidth : Taro.getSystemInfoSync().windowWidth;
  const isWide = windowWidth >= 768;
  const hasDiscount = item.price < item.originalPrice;
  const discount = hasDiscount ? Math.round((1 - item.price / item.originalPrice) * 10) : 0;
  return (
    <View onClick={() => onDetail(item)} style={{ backgroundColor: '#fff', borderRadius: `${radius.xl}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.sm}px`, boxShadow: shadow.sm, position: 'relative' }}>
      {!!item.tag && (
        <View style={{ position: 'absolute', top: '12px', right: '12px', backgroundColor: item.tagColor || colors.warning, padding: '3px 8px', borderRadius: `${radius.full}px` }}>
          <Text style={{ fontSize: '11px', color: '#fff', fontWeight: 700 }}>{item.tag}</Text>
        </View>
      )}
      <View style={{ display: 'flex', flexDirection: isWide ? 'row' : 'column', gap: `${spacing.md}px`, alignItems: 'stretch' }}>
        {item.images && item.images.length > 0 && (
          <Image src={item.images[0]} mode="aspectFit" style={{ width: isWide ? '56%' : '100%', height: isWide ? '390px' : '260px', flexShrink: 0, borderRadius: `${radius.md}px`, backgroundColor: colors.background }} />
        )}
        <View style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <View style={{ display: 'flex', gap: `${spacing.md}px`, marginBottom: `${spacing.sm}px` }}>
        <View style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: (item.iconColor || colors.primary) + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Text style={{ fontSize: '22px' }}>🏪</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '4px' }} numberOfLines={2}>{item.name}</Text>
          <Text style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '4px' }} numberOfLines={2}>{item.subtitle}</Text>
          <Stars rating={item.rating} />
          <Text style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginTop: '2px' }}>{item.reviewCount || 0}人已购</Text>
        </View>
      </View>
      {item.features && item.features.length > 0 && (
        <View style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: `${spacing.sm}px` }}>
          {item.features.map((f, i) => (
            <Text key={i} style={{ fontSize: '11px', color: colors.primary, backgroundColor: colors.primary10, padding: '3px 8px', borderRadius: `${radius.full}px` }}>✓ {f}</Text>
          ))}
        </View>
      )}
      <View style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${colors.border}`, paddingTop: `${spacing.sm}px` }}>
        <View>
          <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.danger }}>¥</Text>
          <Text style={{ fontSize: '24px', fontWeight: 800, color: colors.danger }}>{item.price}</Text>
          {hasDiscount && <Text style={{ fontSize: '12px', color: colors.textMuted, textDecoration: 'line-through', marginLeft: '6px' }}>¥{item.originalPrice}</Text>}
          {hasDiscount && <Text style={{ fontSize: '11px', color: colors.danger, marginLeft: '4px' }}>{discount}折</Text>}
        </View>
        <View onClick={(e) => { e.stopPropagation && e.stopPropagation(); onPay(item); }} style={{ backgroundColor: colors.primary, padding: '10px 18px', borderRadius: `${radius.full}px` }}>
          <Text style={{ fontSize: '14px', color: '#fff', fontWeight: 700 }}>立即购买</Text>
        </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function ServiceDetailModal({ item, onClose, onConsult, onPay }) {
  return (
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <View style={{ backgroundColor: '#fff', borderRadius: '28px 28px 0 0', padding: `${spacing.lg}px`, width: '100%', maxHeight: '85%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        <View style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: colors.border, margin: '0 auto 16px' }} />
        <View style={{ display: 'flex', gap: `${spacing.md}px`, marginBottom: `${spacing.lg}px` }}>
          <View style={{ width: '56px', height: '56px', borderRadius: '16px', backgroundColor: colors.primary10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Text style={{ fontSize: '26px' }}>🏪</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: '16px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '4px' }} numberOfLines={2}>{item.name}</Text>
            <Stars rating={item.rating || 5} />
          </View>
        </View>
        <ScrollView scrollY style={{ maxHeight: '340px', marginBottom: `${spacing.md}px` }}>
          {item.images && item.images.length > 0 && item.images.map((url, i) => (
            <Image key={i} src={url} mode="widthFix" style={{ width: '100%', borderRadius: `${radius.md}px`, marginBottom: `${spacing.sm}px`, backgroundColor: colors.background }} />
          ))}
          {!!item.description && (
            <Text style={{ fontSize: '14px', color: colors.textSecondary, lineHeight: '22px', display: 'block', marginBottom: `${spacing.md}px` }}>{item.description}</Text>
          )}
          {!item.description && item.features && item.features.length > 0 && (
            <View style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: `${spacing.md}px` }}>
              {item.features.map((f, i) => (
                <Text key={i} style={{ fontSize: '12px', color: colors.primary, backgroundColor: colors.primary10, padding: '4px 10px', borderRadius: `${radius.full}px` }}>✓ {f}</Text>
              ))}
            </View>
          )}
          <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.background, borderRadius: `${radius.md}px`, padding: `${spacing.md}px` }}>
            <Text style={{ fontSize: '14px', color: colors.textSecondary }}>服务费用</Text>
            <View>
              {item.price < item.originalPrice && <Text style={{ fontSize: '12px', color: colors.textMuted, textDecoration: 'line-through', marginRight: '6px' }}>¥{item.originalPrice}</Text>}
              <Text style={{ fontSize: '22px', fontWeight: 800, color: colors.danger }}>¥{item.price}</Text>
            </View>
          </View>
        </ScrollView>
        <View style={{ display: 'flex', gap: `${spacing.sm}px` }}>
          <View onClick={onClose} style={{ flex: 1, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.border}` }}>
            <Text style={{ fontSize: '15px', color: colors.textSecondary, fontWeight: 600 }}>返回</Text>
          </View>
          <View onClick={onPay} style={{ flex: 1.4, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary }}>
            <Text style={{ fontSize: '15px', color: '#fff', fontWeight: 700 }}>立即购买 ¥{item.price}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

function PurchaseModal({ item, mode, onClose, shareToken = '' }) {
  const { user, updateUser } = useAuth();
  const isPay = mode === 'pay';
  const [note, setNote] = useState('');
  const [payMethod, setPayMethod] = useState('wechat_pay');
  const [serviceAgreed, setServiceAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const hasSpecs = !!(item?.servicePrices && item.servicePrices.length > 0);
  const [specIdx, setSpecIdx] = useState(0);

  const [checkoutUser, setCheckoutUser] = useState(null);
  const fundBalance = checkoutUser?.healthFund?.total || 0;
  const personalFund = checkoutUser?.healthFund?.personal || 0;
  const corporateFund = checkoutUser?.healthFund?.corporate || 0;
  const fundRuleDescription = checkoutUser?.healthFund?.rule?.description || '';
  const canUseFund = fundBalance > 0;
  const [useFund, setUseFund] = useState(false);
  const [fundAmountInput, setFundAmountInput] = useState('');
  const [coupons, setCoupons] = useState([]);
  const [couponId, setCouponId] = useState(null);
  const [benefitsLoading, setBenefitsLoading] = useState(false);
  const [benefitsError, setBenefitsError] = useState('');

  useEffect(() => {
    if (!isPay) return;
    setBenefitsLoading(true);
    setBenefitsError('');
    Promise.all([servicesAPI.coupons(), userAPI.getMe()]).then(([couponRes, userRes]) => {
      if (couponRes.success) setCoupons(couponRes.data || []);
      if (userRes.success) { setCheckoutUser(userRes.data); updateUser(userRes.data); }
      if (!couponRes.success || !userRes.success) setBenefitsError('优惠权益加载失败，请重试');
    }).catch(() => setBenefitsError('优惠权益加载失败，请检查网络后重试'))
      .finally(() => setBenefitsLoading(false));
  }, [isPay]);

  const currentPrice = hasSpecs ? (item.servicePrices[specIdx]?.price ?? item.price) : item.price;
  const currentSpecLabel = hasSpecs ? item.servicePrices[specIdx]?.label : '';

  const selectedCoupon = coupons.find((c) => c._id === couponId) || null;
  const couponDiscount = selectedCoupon
    ? Math.min(selectedCoupon.type === 'amount' ? selectedCoupon.value : Math.round(currentPrice * (100 - selectedCoupon.value)) / 100, currentPrice)
    : 0;
  const priceAfterCoupon = Math.max(0, Math.round((currentPrice - couponDiscount) * 100) / 100);
  const fundApplied = canUseFund && useFund ? Math.min(Number(fundAmountInput) || 0, fundBalance, priceAfterCoupon) : 0;
  const finalPrice = Math.max(0, Math.round((priceAfterCoupon - fundApplied) * 100) / 100);

  const handleSubmit = async () => {
    if (!serviceAgreed) { setErrMsg('请先阅读并同意《健康管理服务说明》'); return; }
    setSubmitting(true); setErrMsg('');
    try {
      // Always refresh the payer OpenID from the current WeChat session before
      // creating a payment. A stored OpenID may belong to an earlier tester and
      // causes WeChat to reject the payment as payer/order-account mismatch.
      if (isPay && finalPrice > 0) {
        const bound = await authAPI.bindWechat();
        if (!bound.success) throw new Error(bound.message || '微信身份绑定失败');
        setCheckoutUser(bound.data);
        updateUser(bound.data);
      }
      const noteWithSpec = [currentSpecLabel ? `规格：${currentSpecLabel}（¥${currentPrice}）` : '', note.trim()].filter(Boolean).join('；');
      const res = isPay
        ? await servicesAPI.order(item.id, noteWithSpec, payMethod, fundApplied, couponId, currentSpecLabel || undefined, shareToken)
        : await servicesAPI.inquire(item.id, note.trim(), currentSpecLabel || undefined);
      if (res.success) {
        if (res.data?.paymentParams) {
          await requestWechatPayment(res.data.paymentParams);
          await waitForPayment(res.data.orderId);
        }
        setSubmitted(true);
      }
      else setErrMsg(res.message || '提交失败，请重试');
    } catch (e) {
      setErrMsg(e.message || '网络错误，请检查连接后重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
        <View style={{ backgroundColor: '#fff', borderRadius: '28px 28px 0 0', width: '100%', boxSizing: 'border-box', padding: `${spacing.lg}px`, textAlign: 'center' }}>
          <Text style={{ fontSize: '44px', display: 'block', margin: '16px 0' }}>✅</Text>
          <Text style={{ fontSize: '20px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>{isPay ? '支付已完成' : '预约申请已提交'}</Text>
          <Text style={{ fontSize: '14px', color: colors.textSecondary, lineHeight: '22px', display: 'block', marginBottom: `${spacing.xl}px` }}>
            {isPay
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
    <ScrollView scrollY enhanced showScrollbar style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100vh', backgroundColor: '#fff', zIndex: 100 }}>
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
                    <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.danger }}>¥{sp.price}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.background, borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
              <Text style={{ fontSize: '14px', color: colors.textSecondary }}>服务费用</Text>
              <View>
                {item.price < item.originalPrice && <Text style={{ fontSize: '12px', color: colors.textMuted, textDecoration: 'line-through', marginRight: '6px' }}>¥{item.originalPrice}</Text>}
                <Text style={{ fontSize: '22px', fontWeight: 800, color: colors.danger }}>¥{item.price}</Text>
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
                  setUseFund(next);
                  if (next) setFundAmountInput(String(Math.min(fundBalance, priceAfterCoupon)));
                }} style={{ padding: '6px 12px', borderRadius: `${radius.full}px`, border: `1.5px solid ${useFund ? colors.primary : colors.border}`, backgroundColor: useFund ? colors.primary : '#fff' }}>
                  <Text style={{ fontSize: '12px', fontWeight: 600, color: useFund ? '#fff' : colors.textSecondary }}>{useFund ? '已启用' : '使用基金'}</Text>
                </View>
              </View>
              {useFund && (
                <>
                  <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: '6px' }}>自有 ¥{personalFund.toFixed(2)} · 企业赠送 ¥{corporateFund.toFixed(2)}</Text>
                  {!!fundRuleDescription && <Text style={{ fontSize: '11px', color: colors.textSecondary, lineHeight: '17px', display: 'block', marginBottom: '8px' }}>使用规则：{fundRuleDescription}</Text>}
                  <Input
                    type="digit"
                    style={{ border: `1px solid ${colors.border}`, borderRadius: `${radius.md}px`, padding: '10px 12px', fontSize: '14px', marginBottom: `${spacing.md}px`, boxSizing: 'border-box' }}
                    placeholder={`最多可抵扣 ¥${Math.min(fundBalance, priceAfterCoupon)}`}
                    value={fundAmountInput}
                    onInput={(e) => setFundAmountInput(e.detail.value)}
                  />
                </>
              )}
            </>
          )}

          {isPay && !benefitsLoading && !canUseFund && (
            <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: `${spacing.md}px` }}>当前账户暂无可用健康基金</Text>
          )}
          {isPay && benefitsError && (
            <Text style={{ fontSize: '12px', color: colors.danger, display: 'block', marginBottom: `${spacing.md}px` }}>{benefitsError}</Text>
          )}

          {isPay && (couponDiscount > 0 || fundApplied > 0) && (
            <View style={{ backgroundColor: colors.background, borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
              <View style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <Text style={{ fontSize: '13px', color: colors.textSecondary }}>商品原价</Text>
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
                  <Text style={{ fontSize: '13px', color: colors.danger, fontWeight: 600 }}>-¥{fundApplied}</Text>
                </View>
              )}
              <View style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${colors.border}`, paddingTop: '6px', marginTop: '2px' }}>
                <Text style={{ fontSize: '13px', color: colors.textPrimary, fontWeight: 700 }}>应付金额</Text>
                <Text style={{ fontSize: '18px', color: colors.danger, fontWeight: 800 }}>¥{finalPrice}</Text>
              </View>
            </View>
          )}

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
            <Text style={{ fontSize: '15px', color: '#fff', fontWeight: 700 }}>{submitting ? '提交中...' : (isPay ? `确认支付 ¥${finalPrice}` : '提交预约')}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

export default function ServiceMallPage() {
  const { statusBarHeight } = useNavBar();
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState('全部');
  const [detailService, setDetailService] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [purchaseMode, setPurchaseMode] = useState('consult');
  const [services, setServices] = useState([]);
  const [categoryTree, setCategoryTree] = useState([]);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [drawerParentId, setDrawerParentId] = useState('');
  const [shareToken, setShareToken] = useState('');
  const routeParams = Taro.getCurrentInstance()?.router?.params || {};

  Taro.useShareAppMessage(() => {
    if (!detailService || !shareToken) return { title: '嘉医汇', path: '/pages/home/index' };
    return {
      title: detailService.name,
      path: `/pages/services/mall/index?productId=${detailService.id}&shareToken=${shareToken}`,
      imageUrl: detailService.images?.[0],
    };
  });

  useEffect(() => {
    if (!detailService || !user) {
      setShareToken('');
      Taro.hideShareMenu();
      return;
    }
    let active = true;
    Taro.hideShareMenu();
    servicesAPI.createProductShare(detailService.id).then((res) => {
      if (!active || !res.success) return;
      setShareToken(res.data.token);
      Taro.showShareMenu({ menus: ['shareAppMessage'] });
    }).catch(() => {});
    return () => { active = false; };
  }, [detailService?.id, user?._id]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  useEffect(() => {
    servicesAPI.list().then((res) => {
      if (!res.success) throw new Error(res.message || '服务加载失败');
      setServices(res.data?.services || []);
      setCategoryTree(res.data?.categoryTree || (res.data?.categories || []).filter((name) => name !== '全部').map((name) => ({ id: name, name, children: [] })));
      const target = (res.data?.services || []).find((service) => service.id === routeParams.productId);
      if (target) setDetailService(target);
    }).catch(() => {
      setServices([]);
      setCategoryTree([]);
      setListError('服务加载失败，请稍后重试');
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user || !routeParams.shareToken) return;
    servicesAPI.claimProductShare(routeParams.shareToken).catch(() => {});
  }, [user?._id, routeParams.shareToken]);

  const openPurchase = (svc, mode) => {
    if (!user) {
      try {
        const query = [routeParams.productId && `productId=${routeParams.productId}`, routeParams.shareToken && `shareToken=${routeParams.shareToken}`].filter(Boolean).join('&');
        Taro.setStorageSync('jy_post_login_url', `/pages/services/mall/index${query ? `?${query}` : ''}`);
      } catch {}
      Taro.showModal({
        title: '登录后继续',
        content: '服务内容可直接浏览。提交咨询或购买服务时，需要先登录以保存订单和联系信息。',
        confirmText: '去登录',
      }).then(({ confirm }) => {
        if (confirm) Taro.navigateTo({ url: '/pages/auth/login/index' });
      });
      return;
    }
    setPurchaseMode(mode);
    setSelectedService(svc);
  };
  const activeParent = categoryTree.find((category) => category.name === activeCategory || category.children?.some((child) => child.name === activeCategory));
  const selectedNames = activeCategory === '全部'
    ? null
    : activeParent?.name === activeCategory
      ? [activeParent.name, ...(activeParent.children || []).map((child) => child.name)]
      : [activeCategory];
  const filtered = selectedNames ? services.filter((service) => selectedNames.includes(service.category)) : services;

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`,
        backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`,
      }}>
        <View onClick={() => Taro.navigateBack()} style={{ padding: '4px' }}>
          <Icon name="chevron-left" size={20} color={colors.textPrimary} />
        </View>
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>服务商城</Text>
        <View style={{ width: '28px' }} />
      </View>

      <View onClick={() => { setDrawerParentId(activeParent?.id || categoryTree[0]?.id || ''); setCategoryDrawerOpen(true); }} style={{ margin: `${spacing.md}px ${spacing.lg}px ${spacing.sm}px`, padding: '13px 16px', borderRadius: `${radius.md}px`, backgroundColor: '#fff', boxShadow: shadow.sm, display: 'flex', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontSize: '14px', color: colors.textPrimary, fontWeight: 700 }}>{activeCategory === '全部' ? '全部服务' : activeCategory}</Text>
        <Text style={{ fontSize: '12px', color: colors.primary, fontWeight: 700 }}>全部分类 ›</Text>
      </View>

      {categoryDrawerOpen && <View onClick={() => setCategoryDrawerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.35)' }}>
        <View onClick={(event) => event.stopPropagation()} style={{ width: '86%', height: '100%', backgroundColor: '#fff', display: 'flex', flexDirection: 'column' }}>
          <View style={{ padding: `${statusBarHeight + 18}px 16px 14px`, display: 'flex', borderBottom: `1px solid ${colors.border}` }}><Text style={{ flex: 1, fontSize: '18px', fontWeight: 800 }}>服务分类</Text><Text onClick={() => setCategoryDrawerOpen(false)} style={{ fontSize: '18px' }}>×</Text></View>
          <View onClick={() => { setActiveCategory('全部'); setCategoryDrawerOpen(false); }} style={{ padding: '13px 16px', backgroundColor: activeCategory === '全部' ? colors.primary10 : '#fff' }}><Text style={{ color: activeCategory === '全部' ? colors.primary : colors.textPrimary, fontWeight: 700 }}>全部服务（{services.length}）</Text></View>
          <View style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <View style={{ width: '38%', backgroundColor: colors.background }}>
              {categoryTree.filter((item) => (item.totalProductCount ?? item.productCount ?? 0) > 0).map((category) => <View key={category.id} onClick={() => setDrawerParentId(category.id)} style={{ padding: '14px 12px', backgroundColor: drawerParentId === category.id ? '#fff' : colors.background, borderLeft: drawerParentId === category.id ? `3px solid ${colors.primary}` : '3px solid transparent' }}><Text style={{ fontSize: '13px', color: drawerParentId === category.id ? colors.primary : colors.textSecondary, fontWeight: drawerParentId === category.id ? 700 : 500, whiteSpace: 'normal' }}>{category.name}</Text></View>)}
            </View>
            <View style={{ flex: 1, padding: '12px' }}>
              {categoryTree.filter((item) => item.id === drawerParentId).map((category) => <View key={category.id}>
                <View onClick={() => { setActiveCategory(category.name); setCategoryDrawerOpen(false); }} style={{ padding: '11px', marginBottom: '8px', borderRadius: `${radius.sm}px`, backgroundColor: activeCategory === category.name ? colors.primary : colors.background }}><Text style={{ fontSize: '13px', color: activeCategory === category.name ? '#fff' : colors.textPrimary, fontWeight: 700 }}>{category.name}（{category.totalProductCount ?? category.productCount ?? 0}）</Text></View>
                {(category.children || []).filter((child) => (child.productCount ?? 0) > 0).map((child) => <View key={child.id} onClick={() => { setActiveCategory(child.name); setCategoryDrawerOpen(false); }} style={{ padding: '11px', marginBottom: '8px', borderRadius: `${radius.sm}px`, border: `1px solid ${activeCategory === child.name ? colors.primary : colors.border}` }}><Text style={{ fontSize: '13px', color: activeCategory === child.name ? colors.primary : colors.textSecondary, whiteSpace: 'normal' }}>{child.name}（{child.productCount}）</Text></View>)}
              </View>)}
            </View>
          </View>
        </View>
      </View>}

      <View style={{ padding: `0 ${spacing.lg}px`, paddingBottom: `${spacing.xxl}px` }}>
        {loading ? (
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
        ) : (
          <>
            <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: `${spacing.xs}px` }}>{listError || `共 ${filtered.length} 个服务`}</Text>
            {!listError && filtered.length === 0 && <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无可购买服务</Text>}
            {filtered.map((s) => (
              <ServiceCard key={s.id} item={s} onDetail={setDetailService} onPay={(svc) => openPurchase(svc, 'pay')} />
            ))}
          </>
        )}
      </View>

      {detailService && (
        <ServiceDetailModal
          item={detailService}
          onClose={() => setDetailService(null)}
          onConsult={() => { openPurchase(detailService, 'consult'); setDetailService(null); }}
          onPay={() => { openPurchase(detailService, 'pay'); setDetailService(null); }}
        />
      )}

      {selectedService && (
        <PurchaseModal item={selectedService} mode={purchaseMode} shareToken={routeParams.shareToken || ''} onClose={() => setSelectedService(null)} />
      )}
    </View>
  );
}
