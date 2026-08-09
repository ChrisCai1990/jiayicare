import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { authAPI, servicesAPI, messagesAPI, userAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';
import { requestWechatPayment, waitForPayment } from '../../../utils/wechatPay';

// 服务包目录：与后端 backend/src/routes/services.js 的 PACKAGE_CATALOG 完全对齐
const PACKAGES = [
  {
    id: 'pkg_1y', name: '年度服务包', duration: '12 个月', price: 3650, originalPrice: 5000,
    tag: '最超值', tagColor: '#DC3545', highlight: true,
    features: ['专属健管师全年陪伴', '健康管理规划6次', '就医协助服务', 'AI健康规划不限次'],
  },
  {
    id: 'pkg_6m', name: '半年服务包', duration: '6 个月', price: 1980, originalPrice: 2800,
    tag: '推荐', tagColor: colors.primary, highlight: false,
    features: ['专属健管师半年陪伴', '健康管理规划3次', '就医协助服务95折', 'AI健康规划不限次'],
  },
  {
    id: 'pkg_3m', name: '季度服务包', duration: '3 个月', price: 1080, originalPrice: 1480,
    tag: '', tagColor: '', highlight: false,
    features: ['专属健管师季度陪伴', '健康管理规划1次', 'AI健康规划不限次'],
  },
];

const PAYMENT_METHODS = [
  { key: 'wechat_pay', label: '微信支付' },
];

function PackageCard({ pkg, selected, onSelect }) {
  const discount = (pkg.price / pkg.originalPrice * 10).toFixed(1);
  const hl = pkg.highlight;
  return (
    <View onClick={() => onSelect(pkg)} style={{
      backgroundColor: hl ? '#1A2B24' : '#fff', borderRadius: `${radius.md}px`,
      border: `2px solid ${selected ? colors.primary : (hl ? '#1A2B24' : colors.border)}`,
      padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`, position: 'relative',
    }}>
      {!!pkg.tag && (
        <View style={{ position: 'absolute', top: '12px', right: '12px', backgroundColor: pkg.tagColor, padding: '3px 8px', borderRadius: `${radius.full}px` }}>
          <Text style={{ fontSize: '10px', color: '#fff', fontWeight: 700 }}>{pkg.tag}</Text>
        </View>
      )}
      <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: `${spacing.sm}px` }}>
        <View>
          <Text style={{ fontSize: '16px', fontWeight: 700, color: hl ? '#fff' : colors.textPrimary, display: 'block' }}>{pkg.name}</Text>
          <Text style={{ fontSize: '12px', color: hl ? 'rgba(255,255,255,0.7)' : colors.textMuted }}>{pkg.duration}</Text>
        </View>
        <View style={{
          width: '20px', height: '20px', borderRadius: '10px', border: `2px solid ${selected ? colors.primary : colors.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {selected && <View style={{ width: '10px', height: '10px', borderRadius: '5px', backgroundColor: colors.primary }} />}
        </View>
      </View>
      <View style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: `${spacing.sm}px` }}>
        <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.danger }}>¥</Text>
        <Text style={{ fontSize: '28px', fontWeight: 800, color: colors.danger }}>{pkg.price}</Text>
        <Text style={{ fontSize: '12px', color: hl ? 'rgba(255,255,255,0.5)' : colors.textMuted, textDecoration: 'line-through' }}>¥{pkg.originalPrice}</Text>
        <Text style={{ fontSize: '11px', fontWeight: 700, color: hl ? '#fff' : colors.danger, backgroundColor: hl ? 'rgba(255,255,255,0.2)' : colors.danger10, padding: '2px 6px', borderRadius: `${radius.full}px` }}>{discount}折</Text>
      </View>
      <View>
        {pkg.features.map((f, i) => (
          <Text key={i} style={{ fontSize: '12px', color: hl ? 'rgba(255,255,255,0.85)' : colors.textSecondary, display: 'block', marginBottom: '4px' }}>✓ {f}</Text>
        ))}
      </View>
    </View>
  );
}

function ConfirmModal({ pkg, isRenewal, onClose, onSuccess }) {
  const { user, updateUser } = useAuth();
  const [payMethod] = useState('wechat_pay');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [serviceAgreed, setServiceAgreed] = useState(false);
  const [checkoutUser, setCheckoutUser] = useState(user);
  const fundBalance = checkoutUser?.healthFund?.total || 0;
  const [useFund, setUseFund] = useState(false);
  const [fundAmountInput, setFundAmountInput] = useState('');
  const [coupons, setCoupons] = useState([]);
  const [couponId, setCouponId] = useState(null);

  useEffect(() => {
    Promise.all([servicesAPI.coupons(), userAPI.getMe()]).then(([couponRes, userRes]) => {
      if (couponRes.success) setCoupons(couponRes.data || []);
      if (userRes.success) { setCheckoutUser(userRes.data); updateUser(userRes.data); }
    }).catch(() => setErrMsg('优惠权益加载失败，请检查网络后重试'));
  }, []);

  const selectedCoupon = coupons.find((c) => c._id === couponId) || null;
  const couponDiscount = selectedCoupon
    ? Math.min(selectedCoupon.type === 'amount' ? selectedCoupon.value : Math.round(pkg.price * (100 - selectedCoupon.value)) / 100, pkg.price)
    : 0;
  const priceAfterCoupon = Math.max(0, Math.round((pkg.price - couponDiscount) * 100) / 100);
  const fundApplied = useFund ? Math.min(Number(fundAmountInput) || 0, fundBalance, priceAfterCoupon) : 0;
  const finalPrice = Math.max(0, Math.round((priceAfterCoupon - fundApplied) * 100) / 100);

  const handleSubmit = async () => {
    if (!serviceAgreed) { setErrMsg('请先阅读并同意《健康管理服务说明》'); return; }
    setErrMsg(''); setSubmitting(true);
    try {
      if (finalPrice > 0) {
        const bound = await authAPI.bindWechat();
        if (!bound.success) throw new Error(bound.message || '微信身份绑定失败');
      }
      const noteLabel = isRenewal ? `续约申请：${pkg.name}（${pkg.duration}）` : `服务包申请：${pkg.name}（${pkg.duration}）`;
      const res = await servicesAPI.order(pkg.id, noteLabel, payMethod, fundApplied, couponId);
      if (res.success) {
        if (res.data?.paymentParams) {
          await requestWechatPayment(res.data.paymentParams);
          await waitForPayment(res.data.orderId);
        }
        onSuccess(res.data?.orderNo || '');
      }
      else setErrMsg(res.message || '提交失败，请重试');
    } catch (e) {
      setErrMsg(e.message || '网络错误，请检查连接后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView scrollY enhanced style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, height: '100vh', width: '100%', backgroundColor: colors.background, zIndex: 100 }}>
      <View style={{ backgroundColor: colors.background, padding: `${spacing.lg}px`, paddingBottom: `${spacing.xxl}px`, width: '100%', minHeight: '100vh', boxSizing: 'border-box' }}>
        <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.lg}px` }}>{isRenewal ? '确认续约' : '确认开通'}</Text>

        <View style={{ backgroundColor: colors.background, borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px` }}>
          <View style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <Text style={{ fontSize: '13px', color: colors.textSecondary }}>套餐</Text>
            <Text style={{ fontSize: '13px', color: colors.textPrimary, fontWeight: 500 }}>{pkg.name}（{pkg.duration}）</Text>
          </View>
          <View style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
            <Text style={{ fontSize: '13px', color: colors.textSecondary }}>原价</Text>
            <Text style={{ fontSize: '13px', color: colors.textMuted, textDecoration: 'line-through' }}>¥{pkg.originalPrice}</Text>
          </View>
          {couponDiscount > 0 && (
            <View style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <Text style={{ fontSize: '13px', color: colors.textSecondary }}>优惠券抵扣</Text>
              <Text style={{ fontSize: '13px', color: colors.danger, fontWeight: 600 }}>-¥{couponDiscount}</Text>
            </View>
          )}
          {fundApplied > 0 && (
            <View style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <Text style={{ fontSize: '13px', color: colors.textSecondary }}>健康基金抵扣</Text>
              <Text style={{ fontSize: '13px', color: colors.danger, fontWeight: 600 }}>-¥{fundApplied}</Text>
            </View>
          )}
          <View style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${colors.border}`, paddingTop: `${spacing.sm}px`, marginTop: '4px' }}>
            <Text style={{ fontSize: '13px', color: colors.textPrimary, fontWeight: 700 }}>实付金额</Text>
            <Text style={{ fontSize: '20px', color: colors.danger, fontWeight: 800 }}>¥{finalPrice}</Text>
          </View>
        </View>

        {(
          <>
            <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>抵用券</Text>
            <View style={{ marginBottom: `${spacing.md}px` }}>
              {coupons.length === 0 && <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: '8px' }}>当前账户暂无可用抵用券</Text>}
              <View onClick={() => setCouponId(null)} style={{ padding: '10px 12px', borderRadius: `${radius.md}px`, border: `1.5px solid ${!couponId ? colors.primary : colors.border}`, backgroundColor: !couponId ? colors.primary10 : colors.background, marginBottom: '8px' }}>
                <Text style={{ fontSize: '13px', color: !couponId ? colors.textPrimary : colors.textMuted, fontWeight: !couponId ? 700 : 500 }}>不使用优惠券</Text>
              </View>
              {coupons.map((c) => (
                <View key={c._id} onClick={() => setCouponId(c._id)} style={{ padding: '10px 12px', borderRadius: `${radius.md}px`, border: `1.5px solid ${couponId === c._id ? colors.primary : colors.border}`, backgroundColor: couponId === c._id ? colors.primary10 : colors.background, marginBottom: '8px' }}>
                  <Text style={{ fontSize: '13px', color: couponId === c._id ? colors.textPrimary : colors.textMuted, fontWeight: couponId === c._id ? 700 : 500 }}>
                    {(c.title || (c.type === 'amount' ? `¥${c.value}抵用券` : `${c.value / 10}折优惠券`))}{c.minSpend > 0 ? `（满¥${c.minSpend}可用）` : ''}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {fundBalance > 0 && (
          <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: `${spacing.md}px` }}>
            <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary }}>健康基金抵扣（余额¥{fundBalance.toFixed(2)}）</Text>
            <View onClick={() => {
              const next = !useFund;
              setUseFund(next);
              if (next) setFundAmountInput(String(Math.min(fundBalance, priceAfterCoupon)));
            }} style={{ padding: '6px 12px', borderRadius: `${radius.full}px`, border: `1.5px solid ${useFund ? colors.primary : colors.border}`, backgroundColor: useFund ? colors.primary10 : colors.background }}>
              <Text style={{ fontSize: '12px', fontWeight: 600, color: useFund ? colors.textPrimary : colors.textMuted }}>{useFund ? '已启用' : '使用基金'}</Text>
            </View>
          </View>
        )}

        <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary, display: 'block', marginBottom: '8px' }}>支付方式</Text>
        <View style={{ display: 'flex', gap: `${spacing.sm}px`, marginBottom: `${spacing.md}px` }}>
          {PAYMENT_METHODS.map((m) => (
            <View key={m.key} style={{
              flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: `${radius.md}px`,
              border: `1.5px solid ${payMethod === m.key ? colors.primary : colors.border}`,
              backgroundColor: payMethod === m.key ? colors.primary10 : colors.background,
            }}>
              <Text style={{ fontSize: '12px', color: payMethod === m.key ? colors.textPrimary : colors.textMuted, fontWeight: payMethod === m.key ? 700 : 500 }}>✓ {m.label}</Text>
            </View>
          ))}
        </View>

        <Text style={{ fontSize: '11px', color: colors.textMuted, lineHeight: '17px', display: 'block', marginBottom: `${spacing.md}px` }}>
          将通过微信支付完成付款，支付成功后健管师将在 1 个工作日内联系您确认服务激活
        </Text>
        <View onClick={() => setServiceAgreed(!serviceAgreed)} style={{ display: 'flex', alignItems: 'flex-start', gap: '7px', marginBottom: `${spacing.md}px` }}>
          <Text style={{ color: serviceAgreed ? colors.primary : colors.textMuted }}>{serviceAgreed ? '☑' : '☐'}</Text>
          <Text style={{ flex: 1, fontSize: '11px', color: colors.textSecondary, lineHeight: '17px' }}>
            我已阅读并同意<Text style={{ color: colors.primary }} onClick={(e) => { e.stopPropagation && e.stopPropagation(); Taro.navigateTo({ url: '/pages/legal/index?type=service' }); }}>《健康管理服务说明》</Text>，知悉本服务不提供诊断、治疗、处方或检查开单。
          </Text>
        </View>

        {!!errMsg && (
          <View style={{ backgroundColor: '#FDECEA', borderRadius: `${radius.sm}px`, padding: `${spacing.sm}px`, marginBottom: `${spacing.sm}px` }}>
            <Text style={{ fontSize: '12px', color: colors.danger }}>{errMsg}</Text>
          </View>
        )}

        <View style={{ display: 'flex', gap: `${spacing.sm}px`, paddingTop: `${spacing.sm}px` }}>
          <View onClick={submitting ? undefined : onClose} style={{ flex: 1, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.border}` }}>
            <Text style={{ fontSize: '15px', color: colors.textSecondary, fontWeight: 600 }}>取消</Text>
          </View>
          <View onClick={submitting ? undefined : handleSubmit} style={{ flex: 2, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary, opacity: submitting || !serviceAgreed ? 0.6 : 1 }}>
            <Text style={{ fontSize: '15px', color: '#fff', fontWeight: 700 }}>{submitting ? '支付处理中...' : `确认支付 ¥${finalPrice}`}</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

export default function RenewalPage() {
  const { statusBarHeight } = useNavBar();
  const { user } = useAuth();
  const hasService = !!(user?.servicePackage && user?.serviceExpiry);
  const [selected, setSelected] = useState(PACKAGES[0]);
  const [confirming, setConfirming] = useState(false);
  const [success, setSuccess] = useState(false);
  const [orderNo, setOrderNo] = useState('');
  const [intentSending, setIntentSending] = useState(false);

  const expiry = hasService ? new Date(user.serviceExpiry) : null;
  const daysLeft = expiry ? Math.max(0, Math.ceil((expiry - new Date()) / 86400000)) : 0;
  const isExpired = hasService && daysLeft === 0;
  const isExpiring = hasService && daysLeft > 0 && daysLeft <= 30;

  const handleContactManager = async () => {
    setIntentSending(true);
    try {
      const content = `【续约意向】我希望续约当前服务方案（${user?.servicePackage || ''}，到期日：${user?.serviceExpiry}），请协助安排续约。`;
      await messagesAPI.send('manager', content);
      Taro.showModal({
        title: '已发送',
        content: '续约意向已通知健管师，请留意"消息"页面的产品推送并完成支付。',
        confirmText: '去看消息',
        cancelText: '好的',
        success: (res) => {
          if (res.confirm) {
            Taro.setStorageSync('healthHubView', 'team');
            Taro.switchTab({ url: '/pages/chat/index' });
          }
        },
      });
    } catch (e) {
      Taro.showToast({ title: e.message || '发送失败', icon: 'none' });
    } finally {
      setIntentSending(false);
    }
  };

  const Header = ({ title }) => (
    <View style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: `${statusBarHeight + 8}px ${spacing.lg}px ${spacing.md}px`,
      backgroundColor: '#fff', borderBottom: `1px solid ${colors.border}`,
    }}>
      <View onClick={() => Taro.navigateBack()} style={{ padding: '4px' }}>
        <Icon name="chevron-left" size={20} color={colors.textPrimary} />
      </View>
      <Text style={{ fontSize: '18px', fontWeight: 700, color: colors.textPrimary }}>{title}</Text>
      <View style={{ width: '28px' }} />
    </View>
  );

  if (success) {
    return (
      <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
        <Header title="服务包续约" />
        <View style={{ padding: `${spacing.lg}px`, textAlign: 'center', boxSizing: 'border-box' }}>
        <View style={{ width: '80px', height: '80px', borderRadius: '40px', backgroundColor: '#E8F5EF', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '40px auto 16px' }}>
          <Text style={{ fontSize: '40px' }}>✅</Text>
        </View>
        <Text style={{ fontSize: '22px', fontWeight: 800, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>申请已提交</Text>
        {!!orderNo && (
          <View style={{ display: 'inline-flex', gap: '8px', backgroundColor: '#fff', borderRadius: `${radius.md}px`, padding: '8px 16px', marginBottom: `${spacing.md}px` }}>
            <Text style={{ fontSize: '12px', color: colors.textMuted }}>订单号</Text>
            <Text style={{ fontSize: '13px', color: colors.textPrimary, fontWeight: 700 }}>{orderNo}</Text>
          </View>
        )}
        <Text style={{ fontSize: '14px', color: colors.textSecondary, lineHeight: '22px', display: 'block', marginBottom: `${spacing.lg}px` }}>
          健管师将在 1 个工作日内与您联系，确认支付并激活 {selected?.name}，请保持手机畅通。
        </Text>
        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, padding: `${spacing.md}px`, textAlign: 'left', marginBottom: `${spacing.xl}px` }}>
          <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>接下来的流程</Text>
          {[{ step: '01', label: '确认套餐信息', desc: '选择服务期限与抵扣权益' }, { step: '02', label: '完成支付', desc: '微信支付' }, { step: '03', label: '服务正式激活', desc: '享受全部专属权益' }].map((s) => (
            <View key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: `${spacing.sm}px`, marginBottom: `${spacing.sm}px` }}>
              <View style={{ width: '28px', height: '28px', borderRadius: '14px', backgroundColor: colors.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Text style={{ fontSize: '11px', fontWeight: 800, color: '#fff' }}>{s.step}</Text>
              </View>
              <View>
                <Text style={{ fontSize: '13px', fontWeight: 600, color: colors.textPrimary, display: 'block' }}>{s.label}</Text>
                <Text style={{ fontSize: '11px', color: colors.textMuted }}>{s.desc}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={{ display: 'flex', gap: `${spacing.sm}px` }}>
          <View onClick={() => Taro.navigateTo({ url: '/pages/orders/index' })} style={{ flex: 1, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.primary}` }}>
            <Text style={{ fontSize: '14px', color: colors.primary, fontWeight: 600 }}>查看订单</Text>
          </View>
          <View onClick={() => Taro.switchTab({ url: '/pages/home/index' })} style={{ flex: 1, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary }}>
            <Text style={{ fontSize: '14px', color: '#fff', fontWeight: 700 }}>返回首页</Text>
          </View>
        </View>
        </View>
      </View>
    );
  }

  if (hasService) {
    return (
      <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
        <Header title="服务包续约" />
        <View style={{ padding: `${spacing.lg}px`, paddingBottom: `${spacing.xxl}px`, boxSizing: 'border-box' }}>
        <View style={{
          display: 'flex', alignItems: 'flex-start', gap: `${spacing.sm}px`, borderRadius: `${radius.md}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`,
          backgroundColor: isExpired ? '#FDECEA' : isExpiring ? '#FEF3E2' : '#E8F5EF',
          border: `1px solid ${(isExpired ? colors.danger : isExpiring ? colors.warning : colors.success)}30`,
        }}>
          <Text style={{ fontSize: '18px' }}>{isExpired ? '⚠️' : isExpiring ? '⏰' : '🛡️'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{user.servicePackage}</Text>
            <Text style={{ fontSize: '12px', color: colors.textSecondary, marginTop: '2px' }}>
              {isExpired ? '服务包已到期，续费后立即恢复全部功能' : isExpiring ? `服务包将于 ${daysLeft} 天后到期` : `服务包有效，到期日 ${user.serviceExpiry}`}
            </Text>
          </View>
        </View>

        <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, padding: `${spacing.lg}px`, marginBottom: `${spacing.md}px` }}>
          <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>续约由健管师为您安排</Text>
          <Text style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: '20px' }}>
            点击下方按钮通知健管师，健管师确认续约方案后会以消息形式推送给您，届时可在"消息"页面直接勾选支付（支持健康基金和优惠券抵扣）。
          </Text>
        </View>

        <View onClick={() => { Taro.setStorageSync('healthHubView', 'team'); Taro.switchTab({ url: '/pages/chat/index' }); }} style={{
          backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.primary}`,
          padding: `${spacing.md}px`, textAlign: 'center', marginBottom: `${spacing.md}px`,
        }}>
          <Text style={{ fontSize: '14px', color: colors.primary, fontWeight: 700 }}>💬 查看消息里的续约推送</Text>
        </View>

        <View onClick={intentSending ? undefined : handleContactManager} style={{
          backgroundColor: colors.primary, borderRadius: `${radius.md}px`, padding: '14px', textAlign: 'center', opacity: intentSending ? 0.6 : 1,
        }}>
          <Text style={{ fontSize: '15px', color: '#fff', fontWeight: 700 }}>{intentSending ? '发送中...' : '联系健管师续约'}</Text>
        </View>
        </View>
      </View>
    );
  }

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background }}>
      <Header title="服务包续约" />
      <View style={{ padding: `${spacing.lg}px`, paddingBottom: `${spacing.xxl}px`, boxSizing: 'border-box' }}>
      <Text style={{ fontSize: '11px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', display: 'block', marginBottom: `${spacing.sm}px` }}>选择服务套餐</Text>
      {PACKAGES.map((pkg) => (
        <PackageCard key={pkg.id} pkg={pkg} selected={selected?.id === pkg.id} onSelect={setSelected} />
      ))}

      <View style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, padding: `${spacing.md}px`, marginBottom: `${spacing.xxl}px` }}>
        <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.textPrimary, display: 'block', marginBottom: `${spacing.sm}px` }}>专属权益</Text>
        {['专属健管师全程陪伴管理', '健康管理需求梳理与服务规划', '开通后按套餐内容提供非医疗健康管理服务'].map((b, i) => (
          <Text key={i} style={{ fontSize: '12px', color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>🎁 {b}</Text>
        ))}
      </View>
      </View>

      <View style={{ position: 'fixed', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTop: `1px solid ${colors.border}`, padding: `${spacing.md}px ${spacing.lg}px`, boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: shadow.lg }}>
        <View>
          <Text style={{ fontSize: '22px', fontWeight: 800, color: colors.danger, display: 'block' }}>¥{selected?.price}</Text>
          <Text style={{ fontSize: '11px', color: colors.textMuted }}>{selected?.name} · {selected?.duration}</Text>
        </View>
        <View onClick={() => setConfirming(true)} style={{ backgroundColor: colors.primary, borderRadius: `${radius.md}px`, padding: '14px 32px' }}>
          <Text style={{ fontSize: '15px', color: '#fff', fontWeight: 700 }}>立即开通</Text>
        </View>
      </View>

      {confirming && (
        <ConfirmModal
          pkg={selected}
          isRenewal={false}
          onClose={() => setConfirming(false)}
          onSuccess={(no) => { setOrderNo(no); setConfirming(false); setSuccess(true); }}
        />
      )}
    </View>
  );
}
