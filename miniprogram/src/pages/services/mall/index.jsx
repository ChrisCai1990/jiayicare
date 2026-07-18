import React, { useState, useEffect } from 'react';
import { View, Text, Textarea, ScrollView, Image, Input } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { servicesAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';

const PAY_METHODS = [
  { key: 'wechat', label: '微信支付' },
  { key: 'alipay', label: '支付宝' },
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

function BannerCard({ hasService, isMember, servicePackage, daysLeft, onViewOrders, onActivate }) {
  if (hasService) {
    return (
      <View style={{ backgroundColor: colors.primary, borderRadius: `${radius.xl}px`, padding: `${spacing.lg}px`, marginBottom: `${spacing.md}px` }}>
        <Text style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)', backgroundColor: 'rgba(255,255,255,0.2)', padding: '3px 8px', borderRadius: `${radius.full}px`, display: 'inline-block', marginBottom: '6px' }}>专属会员权益</Text>
        <Text style={{ fontSize: '18px', fontWeight: 800, color: '#fff', display: 'block' }}>{servicePackage || '年度服务包'}</Text>
        <Text style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)', display: 'block', margin: '3px 0 10px' }}>全场享 9 折 · 剩余 {daysLeft} 天</Text>
        <View onClick={onViewOrders} style={{ display: 'inline-block', backgroundColor: '#fff', padding: '6px 12px', borderRadius: `${radius.full}px` }}>
          <Text style={{ fontSize: '12px', color: colors.primary, fontWeight: 700 }}>查看我的订单 ›</Text>
        </View>
      </View>
    );
  }
  if (isMember) return null;
  return (
    <View style={{ backgroundColor: '#fff', borderRadius: `${radius.xl}px`, border: `1.5px solid ${colors.primary}30`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
      <View style={{ display: 'flex', gap: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
        <View style={{ width: '48px', height: '48px', borderRadius: '14px', backgroundColor: colors.primary10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Text style={{ fontSize: '22px' }}>🛡️</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: '6px' }}>开通专属服务包</Text>
          <View style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {['专属家庭医生咨询', '健管师全程陪伴', '全年复查提醒', 'AI无限次咨询'].map((p, i) => (
              <Text key={i} style={{ fontSize: '11px', color: colors.textSecondary }}>✓ {p}</Text>
            ))}
          </View>
        </View>
      </View>
      <View onClick={onActivate} style={{ backgroundColor: colors.primary, borderRadius: `${radius.md}px`, padding: '12px 0', textAlign: 'center' }}>
        <Text style={{ fontSize: '14px', fontWeight: 700, color: '#fff' }}>立即开通 ›</Text>
      </View>
    </View>
  );
}

function ServiceCard({ item, onDetail, onPay }) {
  const hasDiscount = item.price < item.originalPrice;
  const discount = hasDiscount ? Math.round((1 - item.price / item.originalPrice) * 10) : 0;
  return (
    <View onClick={() => onDetail(item)} style={{ backgroundColor: '#fff', borderRadius: `${radius.xl}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.sm}px`, boxShadow: shadow.sm, position: 'relative' }}>
      {!!item.tag && (
        <View style={{ position: 'absolute', top: '12px', right: '12px', backgroundColor: item.tagColor || colors.warning, padding: '3px 8px', borderRadius: `${radius.full}px` }}>
          <Text style={{ fontSize: '11px', color: '#fff', fontWeight: 700 }}>{item.tag}</Text>
        </View>
      )}
      {item.images && item.images.length > 0 && (
        <Image src={item.images[0]} mode="aspectFill" style={{ width: '100%', height: '160px', borderRadius: `${radius.md}px`, marginBottom: `${spacing.sm}px`, backgroundColor: colors.background }} />
      )}
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

function PurchaseModal({ item, mode, onClose }) {
  const { user } = useAuth();
  const isPay = mode === 'pay';
  const [note, setNote] = useState('');
  const [payMethod, setPayMethod] = useState('wechat');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const hasSpecs = !!(item?.servicePrices && item.servicePrices.length > 0);
  const [specIdx, setSpecIdx] = useState(0);

  const fundBalance = user?.healthFund?.total || 0;
  const [useFund, setUseFund] = useState(false);
  const [fundAmountInput, setFundAmountInput] = useState('');
  const [coupons, setCoupons] = useState([]);
  const [couponId, setCouponId] = useState(null);

  useEffect(() => {
    if (!isPay) return;
    servicesAPI.coupons().then((res) => { if (res.success) setCoupons(res.data || []); }).catch(() => {});
  }, [isPay]);

  const currentPrice = hasSpecs ? (item.servicePrices[specIdx]?.price ?? item.price) : item.price;
  const currentSpecLabel = hasSpecs ? item.servicePrices[specIdx]?.label : '';

  const selectedCoupon = coupons.find((c) => c._id === couponId) || null;
  const couponDiscount = selectedCoupon
    ? Math.min(selectedCoupon.type === 'amount' ? selectedCoupon.value : Math.round(currentPrice * (100 - selectedCoupon.value)) / 100, currentPrice)
    : 0;
  const priceAfterCoupon = Math.max(0, Math.round((currentPrice - couponDiscount) * 100) / 100);
  const fundApplied = useFund ? Math.min(Number(fundAmountInput) || 0, fundBalance, priceAfterCoupon) : 0;
  const finalPrice = Math.max(0, Math.round((priceAfterCoupon - fundApplied) * 100) / 100);

  const handleSubmit = async () => {
    setSubmitting(true); setErrMsg('');
    try {
      const noteWithSpec = [currentSpecLabel ? `规格：${currentSpecLabel}（¥${currentPrice}）` : '', note.trim()].filter(Boolean).join('；');
      const res = await servicesAPI.order(item.id, noteWithSpec, isPay ? payMethod : undefined, isPay ? fundApplied : undefined, isPay ? couponId : undefined);
      if (res.success) setSubmitted(true);
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
          <Text style={{ fontSize: '20px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>{isPay ? '订单已提交' : '预约申请已提交'}</Text>
          <Text style={{ fontSize: '14px', color: colors.textSecondary, lineHeight: '22px', display: 'block', marginBottom: `${spacing.xl}px` }}>
            {isPay
              ? `已为您生成 ¥${finalPrice} 的订单${finalPrice > 0 ? `（${PAY_METHODS.find((m) => m.key === payMethod)?.label}）` : '（已用健康基金/优惠券全额抵扣）'}。完成付款后，健管师将与您联系预约具体服务时间，可在"我的订单"查看进度。`
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
    <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
      <View style={{ backgroundColor: '#fff', borderRadius: '28px 28px 0 0', padding: `${spacing.lg}px`, width: '100%', maxHeight: '88%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        <View style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: colors.border, margin: '0 auto 16px' }} />
        <ScrollView scrollY style={{ flex: 1 }}>
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
              <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>支付方式</Text>
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

          {isPay && coupons.length > 0 && (
            <>
              <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>优惠券</Text>
              <View style={{ marginBottom: `${spacing.md}px` }}>
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

          {isPay && fundBalance > 0 && (
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
                <Input
                  type="digit"
                  style={{ border: `1px solid ${colors.border}`, borderRadius: `${radius.md}px`, padding: '10px 12px', fontSize: '14px', marginBottom: `${spacing.md}px`, boxSizing: 'border-box' }}
                  placeholder={`最多可抵扣 ¥${Math.min(fundBalance, priceAfterCoupon)}`}
                  value={fundAmountInput}
                  onInput={(e) => setFundAmountInput(e.detail.value)}
                />
              )}
            </>
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
            {isPay ? '提交后生成待收款订单，健管师将与您确认并完成收款，可在"我的订单"查看' : '提交后，健管师将与您联系确认具体服务安排'}
          </Text>
        </ScrollView>

        <View style={{ display: 'flex', gap: `${spacing.sm}px` }}>
          <View onClick={onClose} style={{ flex: 1, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.border}` }}>
            <Text style={{ fontSize: '15px', color: colors.textSecondary, fontWeight: 600 }}>取消</Text>
          </View>
          <View onClick={submitting ? undefined : handleSubmit} style={{ flex: 2, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary, opacity: submitting ? 0.6 : 1 }}>
            <Text style={{ fontSize: '15px', color: '#fff', fontWeight: 700 }}>{submitting ? '提交中...' : (isPay ? `确认支付 ¥${finalPrice}` : '提交预约')}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function ServiceMallPage() {
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState('全部');
  const [detailService, setDetailService] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [purchaseMode, setPurchaseMode] = useState('consult');
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState(['全部']);
  const [loading, setLoading] = useState(true);

  const hasService = !!(user?.servicePackage && user?.serviceExpiry);
  const isMember = !!user?.memberType || hasService;
  const expiry = hasService ? new Date(user.serviceExpiry) : null;
  const daysLeft = expiry ? Math.max(0, Math.ceil((expiry - new Date()) / 86400000)) : 0;

  useEffect(() => {
    servicesAPI.list().then((res) => {
      if (res.success && res.data?.services?.length > 0) {
        setServices(res.data.services);
        setCategories(res.data.categories || ['全部']);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const openPurchase = (svc, mode) => { setPurchaseMode(mode); setSelectedService(svc); };
  const filtered = activeCategory === '全部' ? services : services.filter((s) => s.category === activeCategory);

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <View style={{ padding: `${spacing.lg}px ${spacing.lg}px 0` }}>
        <BannerCard
          hasService={hasService}
          isMember={isMember}
          servicePackage={user?.servicePackage}
          daysLeft={daysLeft}
          onViewOrders={() => Taro.navigateTo({ url: '/pages/orders/index' })}
          onActivate={() => Taro.navigateTo({ url: '/pages/services/renewal/index' })}
        />
      </View>

      <ScrollView scrollX style={{ whiteSpace: 'nowrap', padding: `0 ${spacing.lg}px`, marginBottom: `${spacing.sm}px` }}>
        {categories.map((cat) => (
          <View key={cat} onClick={() => setActiveCategory(cat)} style={{
            display: 'inline-block', padding: '8px 16px', borderRadius: `${radius.full}px`, marginRight: '8px',
            border: `1.5px solid ${activeCategory === cat ? colors.primary : colors.border}`,
            backgroundColor: activeCategory === cat ? colors.primary : '#fff',
          }}>
            <Text style={{ fontSize: '13px', color: activeCategory === cat ? '#fff' : colors.textSecondary, fontWeight: activeCategory === cat ? 700 : 500 }}>{cat}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={{ padding: `0 ${spacing.lg}px`, paddingBottom: `${spacing.xxl}px` }}>
        {loading ? (
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
        ) : (
          <>
            <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: `${spacing.xs}px` }}>共 {filtered.length} 个服务</Text>
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
        <PurchaseModal item={selectedService} mode={purchaseMode} onClose={() => setSelectedService(null)} />
      )}
    </View>
  );
}
