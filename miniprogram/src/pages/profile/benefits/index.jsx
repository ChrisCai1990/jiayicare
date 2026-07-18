import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Image } from '@tarojs/components';
import { colors, spacing, radius, shadow } from '../../../theme';
import { useAuth } from '../../../context/AuthContext';
import { giftsAPI, partnerBenefitsAPI, pointsAPI } from '../../../services/api';

// 对齐 app/src/screens/profile/BenefitsScreen.js
const POINTS_SOURCE_LABEL = { checkin: '打卡', consumption: '消费', redeem: '兑换', adjust: '调整' };
const FUND_TYPE_LABEL = { enterprise: '企业赠送', promotion: '活动奖励', other: '其他赠送' };
const GIFT_TYPE_LABEL = { fund: '健康基金', service: '服务权益' };
const GIFT_TYPE_COLOR = { fund: '#D97706', service: colors.primary };
const GIFT_TYPE_BG = { fund: '#FEF3E2', service: colors.primary10 };
const GIFT_TYPE_ICON = { fund: '💰', service: '🎁' };
const STATUS_LABEL = { active: '有效', used: '已使用', expired: '已过期' };
const STATUS_COLOR = { active: '#D97706', used: colors.textMuted, expired: colors.textMuted };
const STATUS_BG = { active: '#FEF3E2', used: colors.border, expired: '#F5F5F5' };

function GiftCard({ gift, onPress }) {
  const color = GIFT_TYPE_COLOR[gift.giftType] || colors.primary;
  const bg = GIFT_TYPE_BG[gift.giftType] || colors.primary10;
  const icon = GIFT_TYPE_ICON[gift.giftType] || '🎁';
  const isExpired = gift.validTo && new Date(gift.validTo) < new Date();
  const isUsed = gift.status === 'used';
  const statusKey = isUsed ? 'used' : isExpired ? 'expired' : 'active';
  return (
    <View onClick={() => onPress(gift)} style={{
      backgroundColor: '#fff', borderRadius: `${radius.md}px`, marginBottom: `${spacing.sm}px`,
      padding: `${spacing.md}px`, display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`,
      border: `1px solid ${colors.border}`, boxShadow: shadow.sm, opacity: (isExpired || isUsed) ? 0.6 : 1,
    }}>
      <View style={{ width: '44px', height: '44px', borderRadius: '13px', backgroundColor: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Text style={{ fontSize: '20px' }}>{icon}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block', marginBottom: '3px' }}>
          {gift.giftType === 'fund' ? `健康基金 ¥${gift.fundAmount}（${FUND_TYPE_LABEL[gift.fundType] || '赠送'}）` : `${gift.serviceName}${gift.serviceCount > 1 ? ` × ${gift.serviceCount}次` : ''}`}
        </Text>
        <Text style={{ fontSize: '12px', color: colors.textMuted }}>
          来自 {gift.staffId?.name || '健管团队'}{gift.validTo ? `  · 有效期至 ${new Date(gift.validTo).toLocaleDateString('zh-CN')}` : ''}
        </Text>
      </View>
      <View style={{ padding: '4px 10px', borderRadius: `${radius.full}px`, backgroundColor: STATUS_BG[statusKey], flexShrink: 0 }}>
        <Text style={{ fontSize: '12px', fontWeight: 700, color: STATUS_COLOR[statusKey] }}>{STATUS_LABEL[statusKey]}</Text>
      </View>
    </View>
  );
}

function PartnerBenefitCard({ benefit, onPress }) {
  return (
    <View onClick={() => onPress(benefit)} style={{
      backgroundColor: '#fff', borderRadius: `${radius.md}px`, marginBottom: `${spacing.sm}px`,
      padding: `${spacing.md}px`, display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`,
      border: `1px solid ${colors.border}`, boxShadow: shadow.sm,
    }}>
      {benefit.images?.[0] ? (
        <Image src={benefit.images[0]} mode="aspectFill" style={{ width: '52px', height: '52px', borderRadius: '10px', backgroundColor: colors.background, flexShrink: 0 }} />
      ) : (
        <View style={{ width: '52px', height: '52px', borderRadius: '10px', backgroundColor: colors.primary10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Text style={{ fontSize: '22px' }}>🎁</Text>
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textPrimary, display: 'block', marginBottom: '3px' }}>{benefit.title}</Text>
        {!!benefit.subtitle && <Text style={{ fontSize: '12px', color: colors.textMuted }}>{benefit.subtitle}</Text>}
      </View>
    </View>
  );
}

export default function BenefitsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('mine');
  const [gifts, setGifts] = useState([]);
  const [giftsLoading, setGiftsLoading] = useState(true);
  const [detailGift, setDetailGift] = useState(null);
  const [pointsBalance, setPointsBalance] = useState(0);
  const [pointsLogs, setPointsLogs] = useState([]);
  const [pointsExpanded, setPointsExpanded] = useState(false);
  const [groups, setGroups] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [detailBenefit, setDetailBenefit] = useState(null);

  const fund = user?.healthFund || {};
  const fundTotal = fund.total ?? (user?.healthFundBalance || 0);
  const fundPersonal = fund.personal ?? 0;
  const fundCorp = fund.corporate ?? 0;

  const loadGifts = useCallback(async () => {
    try {
      const res = await giftsAPI.list();
      if (res.success) setGifts(res.data);
    } catch {} finally { setGiftsLoading(false); }
  }, []);

  const loadPoints = useCallback(async () => {
    try {
      const res = await pointsAPI.get();
      if (res.success) { setPointsBalance(res.data.balance || 0); setPointsLogs(res.data.logs || []); }
    } catch {}
  }, []);

  const loadPartnerBenefits = useCallback(async () => {
    try {
      const res = await partnerBenefitsAPI.list();
      if (res.success) setGroups(res.data);
    } catch {} finally { setGroupsLoading(false); }
  }, []);

  useEffect(() => { loadGifts(); loadPartnerBenefits(); loadPoints(); }, [loadGifts, loadPartnerBenefits, loadPoints]);

  const activeGifts = gifts.filter((g) => g.status === 'active');
  const historyGifts = gifts.filter((g) => g.status !== 'active');
  const dg = detailGift;
  const dgColor = dg ? (GIFT_TYPE_COLOR[dg.giftType] || colors.primary) : colors.primary;
  const dgBg = dg ? (GIFT_TYPE_BG[dg.giftType] || colors.primary10) : '';
  const dgIcon = dg ? (GIFT_TYPE_ICON[dg.giftType] || '🎁') : '🎁';
  const dgExpired = dg?.validTo && new Date(dg.validTo) < new Date();
  const dgStatusKey = dg?.status === 'used' ? 'used' : dgExpired ? 'expired' : 'active';
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : '不限');

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, paddingBottom: `${spacing.xxl}px` }}>
      <View style={{ display: 'flex', margin: `${spacing.md}px ${spacing.lg}px ${spacing.sm}px`, backgroundColor: colors.border + '40', borderRadius: `${radius.full}px`, padding: '3px' }}>
        <View onClick={() => setTab('mine')} style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: `${radius.full}px`, backgroundColor: tab === 'mine' ? '#fff' : 'transparent' }}>
          <Text style={{ fontSize: '13px', fontWeight: 600, color: tab === 'mine' ? colors.primary : colors.textMuted }}>我的专属权益</Text>
        </View>
        <View onClick={() => setTab('partner')} style={{ flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: `${radius.full}px`, backgroundColor: tab === 'partner' ? '#fff' : 'transparent' }}>
          <Text style={{ fontSize: '13px', fontWeight: 600, color: tab === 'partner' ? colors.primary : colors.textMuted }}>合作伙伴权益</Text>
        </View>
      </View>

      {tab === 'mine' ? (
        <View style={{ padding: `0 ${spacing.lg}px` }}>
          <View style={{ borderRadius: `${radius.md}px`, backgroundColor: '#1A2B24', padding: `${spacing.lg}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.md }}>
            <Text style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '6px' }}>健康基金余额</Text>
            <Text style={{ fontSize: '34px', fontWeight: 800, color: '#fff', display: 'block', marginBottom: `${spacing.md}px` }}>¥{fundTotal.toLocaleString()}</Text>
            <View style={{ display: 'flex', gap: `${spacing.xl}px` }}>
              <View>
                <Text style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '2px' }}>自有基金</Text>
                <Text style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>¥{fundPersonal.toLocaleString()}</Text>
              </View>
              <View>
                <Text style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: '2px' }}>企业赠送</Text>
                <Text style={{ fontSize: '17px', fontWeight: 700, color: '#fff' }}>¥{fundCorp.toLocaleString()}</Text>
              </View>
            </View>
          </View>

          <View onClick={() => setPointsExpanded((v) => !v)} style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, border: `1px solid ${colors.border}`, padding: `${spacing.lg}px`, marginBottom: `${spacing.md}px`, boxShadow: shadow.xs }}>
            <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <View>
                <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: '4px' }}>我的积分</Text>
                <Text style={{ fontSize: '26px', fontWeight: 800, color: colors.textPrimary }}>{pointsBalance}</Text>
              </View>
              <Text style={{ fontSize: '18px', color: colors.textMuted }}>{pointsExpanded ? '▲' : '▼'}</Text>
            </View>
            {pointsExpanded && (
              <View style={{ marginTop: `${spacing.md}px`, borderTop: `1px solid ${colors.border}`, paddingTop: `${spacing.sm}px` }}>
                {pointsLogs.length === 0 ? (
                  <Text style={{ fontSize: '12px', color: colors.textMuted, textAlign: 'center', display: 'block', padding: `${spacing.md}px 0` }}>暂无积分记录，打卡或消费即可获得积分</Text>
                ) : (
                  pointsLogs.slice(0, 20).map((log) => (
                    <View key={log._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: '13px', color: colors.textPrimary, fontWeight: 500, display: 'block' }}>{log.remark || POINTS_SOURCE_LABEL[log.source] || log.source}</Text>
                        <Text style={{ fontSize: '11px', color: colors.textMuted }}>{new Date(log.createdAt).toLocaleDateString('zh-CN')}</Text>
                      </View>
                      <Text style={{ fontSize: '14px', fontWeight: 700, color: log.amount >= 0 ? colors.success : colors.danger }}>{log.amount >= 0 ? '+' : ''}{log.amount}</Text>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>

          {giftsLoading ? (
            <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
          ) : (
            <>
              <Text style={{ fontSize: '11px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', display: 'block', marginBottom: `${spacing.sm}px` }}>有效权益</Text>
              {activeGifts.length === 0 ? (
                <View style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <Text style={{ fontSize: '40px', display: 'block', marginBottom: `${spacing.md}px` }}>🎁</Text>
                  <Text style={{ fontSize: '16px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>暂无有效权益</Text>
                  <Text style={{ fontSize: '13px', color: colors.textMuted, lineHeight: '20px' }}>您的健康管理团队赠送的服务权益和健康基金将在此显示</Text>
                </View>
              ) : (
                activeGifts.map((g) => <GiftCard key={g._id} gift={g} onPress={setDetailGift} />)
              )}
              {historyGifts.length > 0 && (
                <>
                  <Text style={{ fontSize: '11px', fontWeight: 700, color: colors.textMuted, letterSpacing: '1px', display: 'block', margin: `${spacing.md}px 0 ${spacing.sm}px` }}>历史记录</Text>
                  {historyGifts.map((g) => <GiftCard key={g._id} gift={g} onPress={setDetailGift} />)}
                </>
              )}
            </>
          )}
        </View>
      ) : (
        <View style={{ padding: `0 ${spacing.lg}px` }}>
          {groupsLoading ? (
            <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
          ) : groups.length === 0 ? (
            <View style={{ textAlign: 'center', padding: '40px 20px' }}>
              <Text style={{ fontSize: '40px', display: 'block', marginBottom: `${spacing.md}px` }}>🏢</Text>
              <Text style={{ fontSize: '16px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '6px' }}>暂无合作伙伴权益</Text>
              <Text style={{ fontSize: '13px', color: colors.textMuted }}>您的会员等级下暂无可用的合作伙伴权益，敬请期待</Text>
            </View>
          ) : (
            groups.map((g) => (
              <View key={g.partner.id} style={{ marginTop: `${spacing.md}px` }}>
                <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, marginBottom: `${spacing.sm}px` }}>
                  {g.partner.logo ? (
                    <Image src={g.partner.logo} style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: colors.border }} />
                  ) : (
                    <View style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: colors.border, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: '16px' }}>🏢</Text>
                    </View>
                  )}
                  <View>
                    <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{g.partner.name}</Text>
                    <Text style={{ fontSize: '11px', color: colors.textMuted }}>{g.partner.category}</Text>
                  </View>
                </View>
                {g.benefits.map((b) => (
                  <PartnerBenefitCard key={b.id} benefit={b} onPress={(benefit) => setDetailBenefit({ partner: g.partner, benefit })} />
                ))}
              </View>
            ))
          )}
        </View>
      )}

      {dg && (
        <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxHeight: '85%', boxSizing: 'border-box', paddingBottom: '36px' }}>
            <View style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: colors.border, margin: '10px auto 4px' }} />
            <View style={{ display: 'flex', alignItems: 'center', gap: `${spacing.sm}px`, padding: `${spacing.md}px ${spacing.lg}px`, borderBottom: `1px solid ${colors.border}` }}>
              <View style={{ width: '44px', height: '44px', borderRadius: '13px', backgroundColor: dgBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: '20px' }}>{dgIcon}</Text>
              </View>
              <Text style={{ flex: 1, fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>{dg.giftType === 'fund' ? `健康基金 ¥${dg.fundAmount}` : dg.serviceName || '服务权益'}</Text>
              <View style={{ padding: '4px 10px', borderRadius: `${radius.full}px`, backgroundColor: STATUS_BG[dgStatusKey] }}>
                <Text style={{ fontSize: '12px', fontWeight: 700, color: STATUS_COLOR[dgStatusKey] }}>{STATUS_LABEL[dgStatusKey]}</Text>
              </View>
            </View>
            <View style={{ padding: `${spacing.md}px ${spacing.lg}px` }}>
              {[
                ['权益类型', GIFT_TYPE_LABEL[dg.giftType] || '权益'],
                ...(dg.giftType === 'fund'
                  ? [['基金金额', `¥${dg.fundAmount}`], ['基金性质', FUND_TYPE_LABEL[dg.fundType] || '赠送']]
                  : [['服务名称', dg.serviceName], ...(dg.serviceCount > 1 ? [['次数', `${dg.serviceCount} 次`]] : [])]),
                ['赠送人', dg.staffId?.name || '健管团队'],
                ['赠送时间', fmtDate(dg.createdAt)],
                ['有效期', dg.validFrom || dg.validTo ? `${fmtDate(dg.validFrom)} ~ ${fmtDate(dg.validTo)}` : '长期有效'],
              ].map(([label, val], i) => (
                <View key={i} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${colors.borderLight}` }}>
                  <Text style={{ fontSize: '13px', color: colors.textMuted, width: '80px', flexShrink: 0 }}>{label}</Text>
                  <Text style={{ flex: 1, fontSize: '13px', color: colors.textPrimary, fontWeight: 500 }}>{val}</Text>
                </View>
              ))}
              {!!dg.remark && (
                <View style={{ backgroundColor: colors.background, borderRadius: `${radius.xs}px`, padding: `${spacing.sm}px`, marginTop: `${spacing.sm}px` }}>
                  <Text style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: '20px' }}>{dg.remark}</Text>
                </View>
              )}
            </View>
            <View style={{ padding: `${spacing.sm}px ${spacing.lg}px 0` }}>
              <View onClick={() => setDetailGift(null)} style={{ padding: '12px', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.border}`, textAlign: 'center' }}>
                <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textSecondary }}>关闭</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {detailBenefit && (
        <View style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxHeight: '85%', boxSizing: 'border-box', paddingBottom: '36px', display: 'flex', flexDirection: 'column' }}>
            <View style={{ width: '36px', height: '4px', borderRadius: '2px', backgroundColor: colors.border, margin: '10px auto 4px' }} />
            <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, padding: `${spacing.md}px ${spacing.lg}px`, borderBottom: `1px solid ${colors.border}` }}>{detailBenefit.benefit.title}</Text>
            <ScrollView scrollY style={{ maxHeight: '420px' }}>
              <View style={{ padding: `${spacing.md}px ${spacing.lg}px` }}>
                {!!detailBenefit.benefit.subtitle && <Text style={{ fontSize: '13px', color: colors.textMuted, display: 'block', marginBottom: `${spacing.md}px` }}>{detailBenefit.benefit.subtitle}</Text>}
                {detailBenefit.benefit.images?.length > 0 && (
                  <ScrollView scrollX style={{ whiteSpace: 'nowrap', marginBottom: `${spacing.md}px` }}>
                    {detailBenefit.benefit.images.map((url, i) => (
                      <Image key={i} src={url} mode="aspectFill" style={{ width: '240px', height: '160px', borderRadius: `${radius.md}px`, marginRight: `${spacing.sm}px`, display: 'inline-block' }} />
                    ))}
                  </ScrollView>
                )}
                <Text style={{ fontSize: '12px', fontWeight: 700, color: colors.textMuted, display: 'block', marginBottom: '6px' }}>提供方</Text>
                <Text style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: '20px', display: 'block' }}>{detailBenefit.partner.name}</Text>
                {!!detailBenefit.benefit.description && (
                  <>
                    <Text style={{ fontSize: '12px', fontWeight: 700, color: colors.textMuted, display: 'block', marginTop: `${spacing.sm}px`, marginBottom: '6px' }}>权益详情</Text>
                    <Text style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: '20px' }}>{detailBenefit.benefit.description}</Text>
                  </>
                )}
                {!!detailBenefit.benefit.usageGuide && (
                  <>
                    <Text style={{ fontSize: '12px', fontWeight: 700, color: colors.textMuted, display: 'block', marginTop: `${spacing.sm}px`, marginBottom: '6px' }}>使用说明</Text>
                    <View style={{ backgroundColor: colors.primary10, borderRadius: `${radius.xs}px`, padding: `${spacing.sm}px`, marginTop: '4px' }}>
                      <Text style={{ fontSize: '13px', color: colors.textSecondary, lineHeight: '20px' }}>{detailBenefit.benefit.usageGuide}</Text>
                    </View>
                  </>
                )}
              </View>
            </ScrollView>
            <View style={{ padding: `${spacing.sm}px ${spacing.lg}px 0` }}>
              <View onClick={() => setDetailBenefit(null)} style={{ padding: '12px', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.border}`, textAlign: 'center' }}>
                <Text style={{ fontSize: '14px', fontWeight: 600, color: colors.textSecondary }}>关闭</Text>
              </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}
