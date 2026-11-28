import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Image, Input, Button } from '@tarojs/components';
import Taro from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { servicesAPI, mediaUrl } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';
import useNavBar from '../../../hooks/useNavBar';
import Icon from '../../../components/Icon';
import { captureInviteCode } from '../../../utils/invitation';
import { storedArchiveId } from '../../../hooks/useArchiveSubject';
import PurchaseModal, { Stars } from '../../../components/PurchaseModal';

function ServiceCard({ item, onDetail, onPay, isAuthenticated }) {
  const windowWidth = Taro.getWindowInfo ? Taro.getWindowInfo().windowWidth : Taro.getSystemInfoSync().windowWidth;
  const isWide = windowWidth >= 768;
  const [imageFailed, setImageFailed] = useState(false);
  const hasDiscount = item.price < item.originalPrice;
  const discount = hasDiscount ? Math.round((1 - item.price / item.originalPrice) * 10) : 0;
  return (
    <View onClick={() => onDetail(item)} style={{ backgroundColor: '#fff', borderRadius: `${radius.xl}px`, padding: `${spacing.md}px`, marginBottom: `${spacing.sm}px`, boxShadow: shadow.sm, position: 'relative' }}>
      {!!item.tag && (
        <View style={{ position: 'absolute', top: '12px', right: '12px', backgroundColor: item.tagColor || colors.warning, padding: '3px 8px', borderRadius: `${radius.full}px` }}>
          <Text style={{ fontSize: '11px', color: '#fff', fontWeight: 700 }}>{item.tag}</Text>
        </View>
      )}
      <View style={{ display: 'flex', flexDirection: 'row', gap: `${spacing.md}px`, alignItems: 'stretch' }}>
        {item.images && item.images.length > 0 && !imageFailed && (
          <Image src={mediaUrl(item.images[0])} mode="aspectFill" lazyLoad onError={() => setImageFailed(true)} style={{ width: isWide ? '160px' : '88px', height: isWide ? '160px' : '88px', flexShrink: 0, borderRadius: `${radius.md}px`, backgroundColor: colors.background }} />
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
          {item.reviewCount > 0 && <Text style={{ fontSize: '11px', color: colors.textMuted, display: 'block', marginTop: '2px' }}>{item.reviewCount}人已购</Text>}
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
        {isAuthenticated ? (
          <View>
            <Text style={{ fontSize: '13px', fontWeight: 700, color: colors.danger }}>¥</Text>
            <Text style={{ fontSize: '24px', fontWeight: 800, color: colors.danger }}>{item.price}</Text>
            {item.partnerSelfPrice != null && <Text style={{ display: 'block', fontSize: '11px', color: colors.primary }}>本人购买价 ¥{item.partnerSelfPrice}</Text>}
            {hasDiscount && <Text style={{ fontSize: '12px', color: colors.textMuted, textDecoration: 'line-through', marginLeft: '6px' }}>¥{item.originalPrice}</Text>}
            {hasDiscount && <Text style={{ fontSize: '11px', color: colors.danger, marginLeft: '4px' }}>{discount}折</Text>}
          </View>
        ) : (
          <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.warning }}>登录后查看价格</Text>
        )}
        <View onClick={(e) => { e.stopPropagation && e.stopPropagation(); onPay(item); }} style={{ backgroundColor: colors.primary, padding: '10px 18px', borderRadius: `${radius.full}px` }}>
          <Text style={{ fontSize: '14px', color: '#fff', fontWeight: 700 }}>{isAuthenticated ? '立即购买' : '登录查看'}</Text>
        </View>
          </View>
        </View>
      </View>
    </View>
  );
}

function ServiceDetailModal({ item, onClose, onConsult, onPay, isAuthenticated, shareReady, recommendedSpecification = '' }) {
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
            <Image key={i} src={mediaUrl(url)} mode="widthFix" style={{ width: '100%', borderRadius: `${radius.md}px`, marginBottom: `${spacing.sm}px`, backgroundColor: colors.background }} />
          ))}
          {!!item.description && (
            <Text style={{ fontSize: '14px', color: colors.textSecondary, lineHeight: '22px', display: 'block', marginBottom: `${spacing.md}px` }}>{item.description}</Text>
          )}
          {!!recommendedSpecification && <Text style={{ display: 'block', marginBottom: `${spacing.md}px`, fontSize: '14px', color: colors.primary }}>推荐规格：{recommendedSpecification}；购买时可更换规格</Text>}
          {!item.description && item.features && item.features.length > 0 && (
            <View style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: `${spacing.md}px` }}>
              {item.features.map((f, i) => (
                <Text key={i} style={{ fontSize: '12px', color: colors.primary, backgroundColor: colors.primary10, padding: '4px 10px', borderRadius: `${radius.full}px` }}>✓ {f}</Text>
              ))}
            </View>
          )}
          <View style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.background, borderRadius: `${radius.md}px`, padding: `${spacing.md}px` }}>
            <Text style={{ fontSize: '14px', color: colors.textSecondary }}>服务费用</Text>
            {isAuthenticated ? (
              <View>
                {item.price < item.originalPrice && <Text style={{ fontSize: '12px', color: colors.textMuted, textDecoration: 'line-through', marginRight: '6px' }}>¥{item.originalPrice}</Text>}
                <Text style={{ fontSize: '22px', fontWeight: 800, color: colors.danger }}>¥{item.price}</Text>
                {item.partnerSelfPrice != null && <Text style={{ display: 'block', fontSize: '12px', color: colors.primary }}>本人购买价 ¥{item.partnerSelfPrice}</Text>}
              </View>
            ) : (
              <Text style={{ fontSize: '14px', fontWeight: 700, color: colors.warning }}>登录后查看价格</Text>
            )}
          </View>
        </ScrollView>
        <Button
          openType="share"
          disabled={!shareReady}
          style={{ margin: `0 0 ${spacing.sm}px`, padding: '11px', lineHeight: '22px', borderRadius: `${radius.md}px`, border: `1px solid ${colors.primary}`, backgroundColor: '#fff', color: colors.primary, fontSize: '14px', fontWeight: 700 }}
        >
          {shareReady ? '分享当前服务给好友' : '正在准备分享…'}
        </Button>
        <View style={{ display: 'flex', gap: `${spacing.sm}px` }}>
          <View onClick={onClose} style={{ flex: 1, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, border: `1.5px solid ${colors.border}` }}>
            <Text style={{ fontSize: '15px', color: colors.textSecondary, fontWeight: 600 }}>返回</Text>
          </View>
          <View onClick={onPay} style={{ flex: 1.4, textAlign: 'center', padding: '14px', borderRadius: `${radius.md}px`, backgroundColor: colors.primary }}>
            <Text style={{ fontSize: '15px', color: '#fff', fontWeight: 700 }}>{isAuthenticated ? `立即购买 ¥${item.price}` : '登录后购买'}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function ServiceMallPage() {
  Taro.useLoad((options = {}) => { captureInviteCode(options); });
  const { statusBarHeight } = useNavBar();
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState('全部');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [detailService, setDetailService] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [purchaseMode, setPurchaseMode] = useState('consult');
  const [services, setServices] = useState([]);
  const [categoryTree, setCategoryTree] = useState([]);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);
  const [drawerParentId, setDrawerParentId] = useState('');
  const [shareToken, setShareToken] = useState('');
  const routeParams = Taro.getCurrentInstance()?.router?.params || {};

  useEffect(() => { Taro.showShareMenu({ menus: ['shareAppMessage'] }); }, []);

  Taro.useShareAppMessage(() => {
    if (!detailService) return { title: '嘉医汇', path: '/pages/home/index' };
    const query = [
      `productId=${detailService.id}`,
      shareToken && `shareToken=${shareToken}`,
      routeParams.partnerCode && detailService.id === routeParams.productId && `partnerCode=${encodeURIComponent(routeParams.partnerCode)}`,
      user?.referralCode && `invite=${user.referralCode}`,
    ].filter(Boolean).join('&');
    return {
      title: detailService.name,
      path: `/pages/services/mall/index?${query}`,
      imageUrl: mediaUrl(detailService.images?.[0]),
    };
  });

  useEffect(() => {
    if (!detailService) { setShareToken(''); return; }
    // 详情打开后立即恢复微信右上角原生转发，推广令牌异步补齐。
    Taro.showShareMenu({ menus: ['shareAppMessage'] });
    if (!user) {
      setShareToken('');
      return;
    }
    let active = true;
    if (detailService.servicePackage) { setShareToken(''); return; }
    servicesAPI.createProductShare(detailService.id).then((res) => {
      if (!active || !res.success) return;
      setShareToken(res.data.token);
    }).catch(() => {});
    return () => { active = false; };
  }, [detailService?.id, user?._id]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([
      servicesAPI.list(),
      user ? servicesAPI.packages().catch(() => ({ success: false, data: [] })) : Promise.resolve({ success: true, data: [] }),
      user ? servicesAPI.myPartnerPromotion().catch(() => ({ data: null })) : Promise.resolve({ data: null }),
    ]).then(([res, packageRes, promotionRes]) => {
      if (!active) return;
      if (!res.success) throw new Error(res.message || '服务加载失败');
      const packages = (packageRes.success ? packageRes.data || [] : [])
        .filter(item => item.membershipTier === 'consumer365' && item.includes365 && Number(item.durationMonths) === 12 && item.canJoin365 === true)
        .map(item => ({ ...item, servicePackage: true, category: '会员服务',
          subtitle: item.duration, description: (item.features || []).join('；'), fulfillmentType: 'subscription_service' }));
      const selfPrices = new Map((promotionRes.data?.selfPrices || []).map(row => [row.id, row]));
      const allServices = [...(res.data?.services || []), ...packages].map(item => {
        const ownPrice = selfPrices.get(item.id);
        if (!ownPrice) return item;
        const byLabel = new Map((ownPrice.specifications || []).map(row => [row.label, row.price]));
        return { ...item, partnerSelfPrice: ownPrice.price,
          servicePrices: (item.servicePrices || []).map(row => ({ ...row,
            partnerSelfPrice: byLabel.has(row.label) ? byLabel.get(row.label) : null })) };
      });
      setServices(allServices);
      const tree = res.data?.categoryTree || (res.data?.categories || []).filter((name) => name !== '全部').map((name) => ({ id: name, name, children: [] }));
      setCategoryTree(packages.length && !tree.some(item => item.name === '会员服务')
        ? [...tree, { id: 'membership', name: '会员服务', productCount: packages.length, totalProductCount: packages.length, children: [] }] : tree);
      const target = allServices.find((service) => service.id === routeParams.productId);
      if (target && routeParams.beneficiaryUserId && routeParams.pushRecordId && user?.onboardingCompleted) {
        setSelectedService(target); setPurchaseMode('pay');
      } else if (target) setDetailService(target);
    }).catch(() => {
      if (!active) return;
      setServices([]);
      setCategoryTree([]);
      setListError('服务加载失败，请稍后重试');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user?._id]);

  useEffect(() => {
    if (!user || !routeParams.shareToken) return;
    servicesAPI.claimProductShare(routeParams.shareToken).catch(() => {});
  }, [user?._id, routeParams.shareToken]);

  useEffect(() => {
    if (!user || !routeParams.partnerCode || !routeParams.productId) return;
    servicesAPI.claimPartnerReferral(routeParams.productId, routeParams.partnerCode).catch(() => {});
  }, [user?._id, routeParams.partnerCode, routeParams.productId]);

  const openPurchase = (svc, mode) => {
    if (!user) {
      try {
        const query = [routeParams.productId && `productId=${routeParams.productId}`, routeParams.shareToken && `shareToken=${routeParams.shareToken}`, routeParams.partnerCode && `partnerCode=${routeParams.partnerCode}`, routeParams.specificationLabel && `specificationLabel=${encodeURIComponent(routeParams.specificationLabel)}`].filter(Boolean).join('&');
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
    if (!user.onboardingCompleted) {
      try {
        const query = [routeParams.productId && `productId=${routeParams.productId}`, routeParams.shareToken && `shareToken=${routeParams.shareToken}`, routeParams.partnerCode && `partnerCode=${routeParams.partnerCode}`, routeParams.specificationLabel && `specificationLabel=${encodeURIComponent(routeParams.specificationLabel)}`].filter(Boolean).join('&');
        Taro.setStorageSync('jy_post_login_url', `/pages/services/mall/index${query ? `?${query}` : ''}`);
      } catch {}
      Taro.showModal({
        title: '先完成实名建档',
        content: '提交服务前，需要完成登录、姓名、身份证或护照号及联系电话的建档核验。',
        confirmText: '去建档',
        showCancel: false,
      }).then(() => Taro.navigateTo({ url: '/pages/onboarding/index' }));
      return;
    }
    setPurchaseMode(mode);
    setSelectedService(svc);
  };
  const closeSharedDetail = () => {
    if (!user && routeParams.shareToken) {
      try {
        const query = [routeParams.productId && `productId=${routeParams.productId}`, routeParams.shareToken && `shareToken=${routeParams.shareToken}`, routeParams.partnerCode && `partnerCode=${routeParams.partnerCode}`, routeParams.specificationLabel && `specificationLabel=${encodeURIComponent(routeParams.specificationLabel)}`, routeParams.invite && `invite=${routeParams.invite}`].filter(Boolean).join('&');
        Taro.setStorageSync('jy_post_login_url', `/pages/services/mall/index${query ? `?${query}` : ''}`);
      } catch {}
      Taro.showModal({
        title: '登录后查看更多',
        content: '当前分享的服务可直接查看；查看其他服务或购买时，需要先完成登录。',
        confirmText: '去登录',
      }).then(({ confirm }) => {
        if (confirm) Taro.navigateTo({ url: '/pages/auth/login/index' });
      });
      return;
    }
    setDetailService(null);
  };
  const activeParent = categoryTree.find((category) => category.name === activeCategory || category.children?.some((child) => child.name === activeCategory));
  const selectedNames = activeCategory === '全部'
    ? null
    : activeParent?.name === activeCategory
      ? [activeParent.name, ...(activeParent.children || []).map((child) => child.name)]
      : [activeCategory];
  const categoryFiltered = selectedNames ? services.filter((service) => selectedNames.includes(service.category)) : services;
  const normalizedKeyword = searchKeyword.trim().toLowerCase();
  const filtered = normalizedKeyword
    ? categoryFiltered.filter((service) => [
      service.name, service.subtitle, service.category, service.description, ...(service.features || []),
    ].some((value) => String(value || '').toLowerCase().includes(normalizedKeyword)))
    : categoryFiltered;

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

      <View style={{ margin: `0 ${spacing.lg}px ${spacing.md}px`, padding: '11px 14px', borderRadius: `${radius.md}px`, backgroundColor: '#fff', border: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center' }}>
        <Icon name="search" size={17} color={colors.textMuted} />
        <Input
          value={searchKeyword}
          onInput={(event) => setSearchKeyword(event.detail.value)}
          placeholder="搜索服务名称或内容"
          confirmType="search"
          style={{ flex: 1, marginLeft: '8px', fontSize: '14px', color: colors.textPrimary }}
        />
        {!!searchKeyword && <Text onClick={() => setSearchKeyword('')} style={{ padding: '2px 4px', color: colors.textMuted }}>×</Text>}
      </View>

      {categoryDrawerOpen && <View onClick={() => setCategoryDrawerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50, backgroundColor: 'rgba(0,0,0,0.35)' }}>
        <View onClick={(event) => event.stopPropagation()} style={{ width: '86%', height: '100%', backgroundColor: '#fff', display: 'flex', flexDirection: 'column' }}>
          <View style={{ padding: `${statusBarHeight + 18}px 16px 14px`, display: 'flex', borderBottom: `1px solid ${colors.border}` }}><Text style={{ flex: 1, fontSize: '18px', fontWeight: 800 }}>服务分类</Text><Text onClick={() => setCategoryDrawerOpen(false)} style={{ fontSize: '18px' }}>×</Text></View>
          <View onClick={() => { setActiveCategory('全部'); setCategoryDrawerOpen(false); }} style={{ padding: '13px 16px', backgroundColor: activeCategory === '全部' ? colors.primary10 : '#fff' }}><Text style={{ color: activeCategory === '全部' ? colors.primary : colors.textPrimary, fontWeight: 700 }}>全部服务（{services.length}）</Text></View>
          <View style={{ display: 'flex', flex: 1, minHeight: 0 }}>
            <View style={{ width: '38%', backgroundColor: colors.background }}>
              {categoryTree.map((category) => <View key={category.id} onClick={() => setDrawerParentId(category.id)} style={{ padding: '14px 12px', backgroundColor: drawerParentId === category.id ? '#fff' : colors.background, borderLeft: drawerParentId === category.id ? `3px solid ${colors.primary}` : '3px solid transparent' }}><Text style={{ fontSize: '13px', color: drawerParentId === category.id ? colors.primary : colors.textSecondary, fontWeight: drawerParentId === category.id ? 700 : 500, whiteSpace: 'normal' }}>{category.name}</Text></View>)}
            </View>
            <View style={{ flex: 1, padding: '12px' }}>
              {categoryTree.filter((item) => item.id === drawerParentId).map((category) => <View key={category.id}>
                <View onClick={() => { setActiveCategory(category.name); setCategoryDrawerOpen(false); }} style={{ padding: '11px', marginBottom: '8px', borderRadius: `${radius.sm}px`, backgroundColor: activeCategory === category.name ? colors.primary : colors.background }}><Text style={{ fontSize: '13px', color: activeCategory === category.name ? '#fff' : colors.textPrimary, fontWeight: 700 }}>{category.name}（{category.totalProductCount ?? category.productCount ?? 0}）</Text></View>
                {(category.children || []).map((child) => <View key={child.id} onClick={() => { setActiveCategory(child.name); setCategoryDrawerOpen(false); }} style={{ padding: '11px', marginBottom: '8px', borderRadius: `${radius.sm}px`, border: `1px solid ${activeCategory === child.name ? colors.primary : colors.border}` }}><Text style={{ fontSize: '13px', color: activeCategory === child.name ? colors.primary : colors.textSecondary, whiteSpace: 'normal' }}>{child.name}（{child.productCount}）</Text></View>)}
              </View>)}
            </View>
          </View>
        </View>
      </View>}

      <View style={{ padding: `0 ${spacing.lg}px`, paddingBottom: `${spacing.xxl}px` }}>
        {!user && routeParams.productId && routeParams.partnerCode && (
          <View onClick={() => openPurchase({ id: routeParams.productId }, 'pay')} style={{ padding: `${spacing.md}px`, marginBottom: `${spacing.md}px`, backgroundColor: colors.primary10, borderRadius: `${radius.md}px` }}>
            <Text style={{ color: colors.primary, fontWeight: 700 }}>登录后查看推荐的会员服务并购买 ›</Text>
          </View>
        )}
        {loading ? (
          <Text style={{ fontSize: '13px', color: colors.textMuted }}>加载中...</Text>
        ) : (
          <>
            <Text style={{ fontSize: '12px', color: colors.textMuted, display: 'block', marginBottom: `${spacing.xs}px` }}>{listError || `共 ${filtered.length} 个服务`}</Text>
            {!listError && filtered.length === 0 && <Text style={{ fontSize: '13px', color: colors.textMuted }}>暂无可购买服务</Text>}
            {filtered.map((s) => (
              <ServiceCard key={s.id} item={s} isAuthenticated={!!user} onDetail={setDetailService} onPay={(svc) => openPurchase(svc, 'pay')} />
            ))}
          </>
        )}
      </View>

      {detailService && (
        <ServiceDetailModal
          item={detailService}
          recommendedSpecification={detailService.id === routeParams.productId ? decodeURIComponent(routeParams.specificationLabel || '') : ''}
          isAuthenticated={!!user}
          shareReady={!user || !!shareToken || !!detailService.servicePackage}
          onClose={closeSharedDetail}
          onConsult={() => { openPurchase(detailService, 'consult'); setDetailService(null); }}
          onPay={() => { openPurchase(detailService, 'pay'); setDetailService(null); }}
        />
      )}

      {selectedService && (
        <PurchaseModal item={selectedService} mode={purchaseMode} shareToken={routeParams.shareToken || ''} partnerCode={selectedService.id === routeParams.productId ? routeParams.partnerCode || '' : ''}
          initialSpecificationLabel={selectedService.id === routeParams.productId ? decodeURIComponent(routeParams.specificationLabel || '') : ''}
          initialBeneficiaryUserId={selectedService.id === routeParams.productId && routeParams.beneficiaryUserId ? routeParams.beneficiaryUserId : storedArchiveId(user?._id)}
          pushRecordId={selectedService.id === routeParams.productId ? routeParams.pushRecordId || '' : ''}
          onClose={() => setSelectedService(null)} />
      )}
    </View>
  );
}
