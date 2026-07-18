import React, { useState, useEffect, useCallback } from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { colors, spacing, radius, shadow } from '../../../theme';
import { screeningAPI } from '../../../services/api';
import { useAuth } from '../../../context/AuthContext';

// 对齐 app/src/screens/records/SpecialScreeningScreen.js
// 简化点：app端web用<input type=file>选PDF/图片；小程序用 Taro.chooseImage 只支持图片
// （小程序没有通用文件选择器，需要选PDF得用 Taro.chooseMessageFile，仅企业微信/特定客户端支持，
//  这里选图片场景已覆盖大多数体检报告拍照上传需求）
const CATALOG = [
  { key: 'tumor', label: '肿瘤风险筛查', icon: '🔬', color: '#DC3545', items: [
    { id: 'tumor|肺癌|肺CT', parent: '肺癌', label: '肺CT', gender: null },
    { id: 'tumor|结直肠癌|粪便隐血', parent: '结直肠癌', label: '粪便隐血', gender: null },
    { id: 'tumor|结直肠癌|粪便基因检测', parent: '结直肠癌', label: '粪便基因检测', gender: null },
    { id: 'tumor|结直肠癌|肠镜', parent: '结直肠癌', label: '肠镜', gender: null },
    { id: 'tumor|结直肠癌|肠镜病理', parent: '结直肠癌', label: '肠镜病理', gender: null },
    { id: 'tumor|肝癌|乙肝三系', parent: '肝癌', label: '乙肝三系', gender: null },
    { id: 'tumor|肝癌|HBV-DNA', parent: '肝癌', label: 'HBV-DNA', gender: null },
    { id: 'tumor|肝癌|丙肝两项', parent: '肝癌', label: '丙肝两项', gender: null },
    { id: 'tumor|肝癌|肝脏超声', parent: '肝癌', label: '肝脏超声', gender: null },
    { id: 'tumor|肝癌|肝脏磁共振', parent: '肝癌', label: '肝脏磁共振', gender: null },
    { id: 'tumor|肝癌|肝脏纤维弹性超声', parent: '肝癌', label: '肝脏纤维弹性超声', gender: null },
    { id: 'tumor|胃癌|碳13呼气试验', parent: '胃癌', label: '碳13呼气试验', gender: null },
    { id: 'tumor|胃癌|胃蛋白酶原', parent: '胃癌', label: '胃蛋白酶原', gender: null },
    { id: 'tumor|胃癌|胃泌素', parent: '胃癌', label: '胃泌素', gender: null },
    { id: 'tumor|胃癌|胃镜', parent: '胃癌', label: '胃镜', gender: null },
    { id: 'tumor|胃癌|胃镜病理', parent: '胃癌', label: '胃镜病理', gender: null },
    { id: 'tumor|食管癌|胃食管镜', parent: '食管癌', label: '胃食管镜', gender: null },
    { id: 'tumor|食管癌|食管镜病理', parent: '食管癌', label: '食管镜病理', gender: null },
    { id: 'tumor|前列腺癌|前列腺超声', parent: '前列腺癌', label: '前列腺超声', gender: '男' },
    { id: 'tumor|乳腺癌|乳腺超声', parent: '乳腺癌', label: '乳腺超声', gender: '女' },
    { id: 'tumor|乳腺癌|乳腺钼靶', parent: '乳腺癌', label: '乳腺钼靶', gender: '女' },
    { id: 'tumor|乳腺癌|乳腺磁共振', parent: '乳腺癌', label: '乳腺磁共振', gender: '女' },
    { id: 'tumor|宫颈癌|HPV', parent: '宫颈癌', label: 'HPV', gender: '女' },
    { id: 'tumor|宫颈癌|TCT', parent: '宫颈癌', label: 'TCT', gender: '女' },
    { id: 'tumor|子宫内膜癌|阴道超声', parent: '子宫内膜癌/卵巢癌', label: '阴道超声', gender: '女' },
    { id: 'tumor|甲状腺癌|甲状腺超声', parent: '甲状腺癌', label: '甲状腺超声', gender: null },
    { id: 'tumor|甲状腺癌|甲状腺穿刺', parent: '甲状腺癌', label: '甲状腺穿刺', gender: null },
    { id: 'tumor|膀胱癌|尿常规', parent: '膀胱癌', label: '尿常规', gender: null },
    { id: 'tumor|膀胱癌|膀胱超声', parent: '膀胱癌', label: '膀胱超声', gender: null },
    { id: 'tumor|胰腺癌|胰腺超声', parent: '胰腺癌', label: '胰腺超声', gender: null },
    { id: 'tumor|胰腺癌|胰腺MRI', parent: '胰腺癌', label: '胰腺MRI', gender: null },
    { id: 'tumor|淋巴瘤|淋巴结超声', parent: '淋巴瘤', label: '淋巴结超声', gender: null },
    { id: 'tumor|淋巴瘤|淋巴结磁共振', parent: '淋巴瘤', label: '淋巴结磁共振', gender: null },
    { id: 'tumor|鼻咽癌|EB病毒IgA', parent: '鼻咽癌', label: 'EB病毒IgA', gender: null },
    { id: 'tumor|鼻咽癌|EB病毒IgM', parent: '鼻咽癌', label: 'EB病毒IgM', gender: null },
    { id: 'tumor|鼻咽癌|EB病毒IgG', parent: '鼻咽癌', label: 'EB病毒IgG', gender: null },
    { id: 'tumor|鼻咽癌|鼻咽镜', parent: '鼻咽癌', label: '鼻咽镜', gender: null },
    { id: 'tumor|肾癌|肾脏超声', parent: '肾癌', label: '肾脏超声', gender: null },
    { id: 'tumor|肿瘤标志物|甲胎蛋白', parent: '肿瘤标志物', label: '甲胎蛋白', gender: null },
    { id: 'tumor|肿瘤标志物|癌胚抗原', parent: '肿瘤标志物', label: '癌胚抗原', gender: null },
    { id: 'tumor|肿瘤标志物|铁蛋白', parent: '肿瘤标志物', label: '铁蛋白', gender: null },
    { id: 'tumor|肿瘤标志物|CA125', parent: '肿瘤标志物', label: 'CA125', gender: '女' },
    { id: 'tumor|肿瘤标志物|CA19-9', parent: '肿瘤标志物', label: 'CA19-9', gender: null },
    { id: 'tumor|肿瘤标志物|SCC', parent: '肿瘤标志物', label: 'SCC', gender: null },
    { id: 'tumor|肿瘤标志物|NSE', parent: '肿瘤标志物', label: 'NSE', gender: null },
    { id: 'tumor|肿瘤标志物|CYFRA21-1', parent: '肿瘤标志物', label: 'CYFRA21-1', gender: null },
    { id: 'tumor|肿瘤标志物|ProGRP', parent: '肿瘤标志物', label: 'ProGRP', gender: null },
    { id: 'tumor|肿瘤标志物|T-PSA', parent: '肿瘤标志物', label: 'T-PSA', gender: '男' },
    { id: 'tumor|肿瘤标志物|F-PSA', parent: '肿瘤标志物', label: 'F-PSA', gender: '男' },
    { id: 'tumor|肿瘤标志物|fPSA/tPSA', parent: '肿瘤标志物', label: 'fPSA/tPSA', gender: '男' },
    { id: 'tumor|肿瘤标志物|TSGF', parent: '肿瘤标志物', label: 'TSGF', gender: null },
    { id: 'tumor|肿瘤标志物|HCG', parent: '肿瘤标志物', label: 'HCG', gender: null },
  ]},
  { key: 'cardiovascular', label: '心脑血管病风险筛查', icon: '❤️', color: '#D97706', items: [
    { id: 'cardio|心脏筛查|脂蛋白磷脂酶A2', parent: '心脏筛查', label: '脂蛋白磷脂酶A2', gender: null },
    { id: 'cardio|心脏筛查|常规心电图', parent: '心脏筛查', label: '常规心电图', gender: null },
    { id: 'cardio|心脏筛查|动态心电图', parent: '心脏筛查', label: '动态心电图', gender: null },
    { id: 'cardio|心脏筛查|心脏超声', parent: '心脏筛查', label: '心脏超声', gender: null },
    { id: 'cardio|心脏筛查|冠脉CTA', parent: '心脏筛查', label: '冠脉CTA', gender: null },
    { id: 'cardio|心脏筛查|心脏磁共振', parent: '心脏筛查', label: '心脏磁共振', gender: null },
    { id: 'cardio|心脏筛查|运动平板', parent: '心脏筛查', label: '运动平板', gender: null },
    { id: 'cardio|大脑筛查|同型半胱氨酸', parent: '大脑筛查', label: '同型半胱氨酸', gender: null },
    { id: 'cardio|大脑筛查|颈动脉超声', parent: '大脑筛查', label: '颈动脉超声', gender: null },
    { id: 'cardio|大脑筛查|头颅MRI', parent: '大脑筛查', label: '头颅MRI', gender: null },
    { id: 'cardio|大脑筛查|颅脑MRA', parent: '大脑筛查', label: '颅脑MRA', gender: null },
    { id: 'cardio|其他|动脉硬化测定', parent: '其他', label: '动脉硬化测定', gender: null },
  ]},
  { key: 'chronic', label: '慢性病筛查', icon: '💊', color: '#7C3AED', items: [
    { id: 'chronic|高血压|血压', parent: '高血压筛查', label: '血压', gender: null },
    { id: 'chronic|高血压|动态血压', parent: '高血压筛查', label: '动态血压', gender: null },
    { id: 'chronic|糖尿病|空腹血糖', parent: '糖尿病筛查', label: '空腹血糖', gender: null },
    { id: 'chronic|糖尿病|糖化血红蛋白', parent: '糖尿病筛查', label: '糖化血红蛋白', gender: null },
    { id: 'chronic|糖尿病|空腹胰岛素', parent: '糖尿病筛查', label: '空腹胰岛素', gender: null },
    { id: 'chronic|糖尿病|空腹C肽', parent: '糖尿病筛查', label: '空腹C肽', gender: null },
    { id: 'chronic|肝功能|肝功', parent: '肝脏功能评估', label: '肝功', gender: null },
    { id: 'chronic|肾功能|肾功能', parent: '肾脏功能评估', label: '肾功能', gender: null },
    { id: 'chronic|肾功能|尿微量白蛋白', parent: '肾脏功能评估', label: '尿微量白蛋白', gender: null },
    { id: 'chronic|甲状腺|甲状腺功能7项', parent: '甲状腺功能评估', label: '甲状腺功能7项', gender: null },
    { id: 'chronic|甲状腺|甲状腺球蛋白', parent: '甲状腺功能评估', label: '甲状腺球蛋白', gender: null },
    { id: 'chronic|老年痴呆|综合筛查', parent: '老年痴呆筛查', label: '综合筛查', gender: null },
    { id: 'chronic|骨质疏松|综合筛查', parent: '骨质疏松筛查', label: '综合筛查', gender: null },
    { id: 'chronic|更年期|综合筛查', parent: '更年期筛查', label: '综合筛查', gender: null },
  ]},
  { key: 'health_promote', label: '健康促进筛查', icon: '🌿', color: '#22A06B', items: [
    { id: 'hp|特殊检测|慢性食物过敏检测', parent: '特殊检测', label: '慢性食物过敏检测', gender: null },
    { id: 'hp|特殊检测|肠道菌群基因测序', parent: '特殊检测', label: '肠道菌群基因测序', gender: null },
    { id: 'hp|特殊检测|端粒长度检测', parent: '特殊检测', label: '端粒长度检测', gender: null },
    { id: 'hp|特殊检测|精准基因检测', parent: '特殊检测', label: '精准基因检测', gender: null },
    { id: 'hp|特殊检测|性别荷尔蒙检测', parent: '特殊检测', label: '性别荷尔蒙检测', gender: null },
    { id: 'hp|特殊检测|抗压力荷尔蒙检测', parent: '特殊检测', label: '抗压力荷尔蒙检测', gender: null },
    { id: 'hp|特殊检测|抗氧化维生素检测', parent: '特殊检测', label: '抗氧化维生素检测', gender: null },
    { id: 'hp|特殊检测|营养与重金属元素', parent: '特殊检测', label: '营养与重金属元素', gender: null },
    { id: 'hp|特殊检测|尿碘检测', parent: '特殊检测', label: '尿碘检测', gender: null },
  ]},
  { key: 'other', label: '其他筛查', icon: '📋', color: '#6B7280', items: [
    { id: 'other|基础检查|血常规', parent: '基础检查', label: '血常规', gender: null },
    { id: 'other|基础检查|电解质', parent: '基础检查', label: '电解质', gender: null },
    { id: 'other|基础检查|25羟基维生素D', parent: '基础检查', label: '25-羟基维生素D', gender: null },
    { id: 'other|基础检查|凝血功能', parent: '基础检查', label: '凝血功能', gender: null },
    { id: 'other|基础检查|D二聚体', parent: '基础检查', label: 'D-二聚体', gender: null },
    { id: 'other|基础检查|传染病4项', parent: '基础检查', label: '传染病4项', gender: null },
  ]},
];

const STATUS_CFG = {
  pending: { label: '待检查', bg: '#F3F4F6', color: '#8AA89C' },
  uploaded: { label: '待审核', bg: '#FEF3E2', color: '#D97706' },
  completed: { label: '已完成', bg: '#E8F5EF', color: '#22A06B' },
};

function groupByParent(items) {
  const map = {};
  items.forEach((it) => { if (!map[it.parent]) map[it.parent] = []; map[it.parent].push(it); });
  return Object.entries(map).map(([parent, checks]) => ({ parent, checks }));
}

function fileToBase64(filePath) {
  return new Promise((resolve, reject) => {
    const fs = Taro.getFileSystemManager();
    fs.readFile({
      filePath,
      encoding: 'base64',
      success: (res) => resolve(res.data),
      fail: reject,
    });
  });
}

export default function SpecialScreeningPage() {
  const { user } = useAuth();
  const gender = user?.gender || null;
  const [userItems, setUserItems] = useState({});
  const [expandedCats, setExpandedCats] = useState({ tumor: true });
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(null);

  const loadItems = useCallback(async () => {
    try {
      const res = await screeningAPI.list();
      const map = {};
      (res.data || []).forEach((it) => { map[it.itemId] = it; });
      setUserItems(map);
    } catch {} finally { setLoading(false); }
  }, []);

  useDidShow(() => { loadItems(); });

  const toggleItem = async (catKey, item) => {
    const existing = userItems[item.id];
    if (existing) {
      if (existing.status !== 'pending') return;
      try {
        await screeningAPI.deselect(existing._id);
        setUserItems((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
      } catch (e) { Taro.showToast({ title: e.message || '操作失败', icon: 'none' }); }
    } else {
      try {
        const res = await screeningAPI.select({ itemId: item.id, category: catKey, parentLabel: item.parent, itemLabel: item.label });
        setUserItems((prev) => ({ ...prev, [item.id]: res.data }));
      } catch (e) { Taro.showToast({ title: e.message || '操作失败', icon: 'none' }); }
    }
  };

  const handleUpload = async (catItem) => {
    let dbItem = userItems[catItem.id];
    if (!dbItem) {
      try {
        const catKey = CATALOG.find((c) => c.items.some((i) => i.id === catItem.id))?.key || '';
        const res = await screeningAPI.select({ itemId: catItem.id, category: catKey, parentLabel: catItem.parent, itemLabel: catItem.label });
        dbItem = res.data;
        setUserItems((prev) => ({ ...prev, [catItem.id]: dbItem }));
      } catch (e) {
        Taro.showToast({ title: e.message || '操作失败', icon: 'none' });
        return;
      }
    }

    try {
      const chosen = await Taro.chooseImage({ count: 1, sizeType: ['compressed'] });
      const filePath = chosen.tempFilePaths[0];
      const fileInfo = chosen.tempFiles?.[0];
      if (!filePath) return;
      setUploading(catItem.id);
      const base64 = await fileToBase64(filePath);
      await screeningAPI.upload(dbItem._id, {
        title: `${catItem.parent} · ${catItem.label}`,
        content: base64,
        mimeType: 'image/jpeg',
        fileSize: fileInfo?.size ? `${(fileInfo.size / 1024).toFixed(0)}KB` : '',
        pages: 1,
        date: new Date().toISOString().slice(0, 10),
      });
      await loadItems();
      Taro.showToast({ title: '上传成功', icon: 'success' });
    } catch (e) {
      if (e.errMsg && e.errMsg.includes('cancel')) return;
      Taro.showToast({ title: e.message || '上传失败', icon: 'none' });
    } finally {
      setUploading(null);
    }
  };

  const toggleCat = (key) => setExpandedCats((prev) => ({ ...prev, [key]: !prev[key] }));
  const filterItems = (items) => (gender ? items.filter((it) => !it.gender || it.gender === gender) : items);
  const getCatStats = (items) => {
    const filtered = filterItems(items);
    const selected = filtered.filter((it) => userItems[it.id]);
    const done = selected.filter((it) => userItems[it.id]?.status === 'completed');
    return { total: filtered.length, selected: selected.length, done: done.length };
  };

  return (
    <View style={{ minHeight: '100vh', backgroundColor: colors.background, paddingBottom: `${spacing.xxl}px` }}>
      <View style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: `10px ${spacing.md}px`, backgroundColor: '#F0F4F8' }}>
        <Text style={{ fontSize: '12px', color: colors.textMuted, lineHeight: '17px' }}>ℹ️ 勾选检查项目并上传报告，系统将与您的健康档案关联。</Text>
      </View>

      {loading ? (
        <Text style={{ fontSize: '13px', color: colors.textMuted, textAlign: 'center', display: 'block', marginTop: '40px' }}>加载中...</Text>
      ) : (
        <View style={{ padding: `${spacing.md}px` }}>
          {CATALOG.map((cat) => {
            const stats = getCatStats(cat.items);
            const isOpen = expandedCats[cat.key];
            const groups = groupByParent(filterItems(cat.items));
            return (
              <View key={cat.key} style={{ backgroundColor: '#fff', borderRadius: `${radius.md}px`, boxShadow: shadow.card, overflow: 'hidden', marginBottom: `${spacing.sm}px` }}>
                <View onClick={() => toggleCat(cat.key)} style={{ display: 'flex', alignItems: 'center', padding: `${spacing.md}px`, gap: `${spacing.sm}px` }}>
                  <View style={{ width: '36px', height: '36px', borderRadius: `${radius.xs}px`, backgroundColor: cat.color + '30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: '18px' }}>{cat.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, display: 'block' }}>{cat.label}</Text>
                    <Text style={{ fontSize: '11px', color: colors.textMuted }}>已选 {stats.selected} · 已完成 {stats.done}/{stats.total}</Text>
                  </View>
                  <Text style={{ fontSize: '12px', color: colors.textMuted }}>{isOpen ? '▲' : '▼'}</Text>
                </View>

                {isOpen && (
                  <View style={{ borderTop: `1px solid ${colors.border}` }}>
                    {groups.map(({ parent, checks }) => (
                      <View key={parent} style={{ padding: `${spacing.sm}px ${spacing.md}px 0` }}>
                        <Text style={{ fontSize: '12px', fontWeight: 600, color: colors.textSecondary, display: 'block', marginBottom: '6px', paddingLeft: '4px' }}>{parent}</Text>
                        {checks.map((it, idx) => {
                          const dbItem = userItems[it.id];
                          const checked = !!dbItem;
                          const status = dbItem?.status || null;
                          const stCfg = status ? STATUS_CFG[status] : null;
                          const isLast = idx === checks.length - 1;
                          const locked = status === 'uploaded' || status === 'completed';
                          return (
                            <View key={it.id} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', gap: '8px', minHeight: '30px', borderBottom: isLast ? 'none' : `1px solid ${colors.borderLight}` }}>
                              <View onClick={() => !locked && toggleItem(cat.key, it)} style={{
                                width: '20px', height: '20px', borderRadius: '4px', border: `1.5px solid ${checked ? colors.primary : colors.border}`,
                                backgroundColor: checked ? colors.primary : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              }}>
                                {checked && <Text style={{ color: '#fff', fontSize: '11px' }}>✓</Text>}
                              </View>
                              <Text style={{ flex: 1, fontSize: '13px', color: checked ? colors.textPrimary : colors.textMuted }}>{it.label}</Text>
                              {!!it.gender && <Text style={{ fontSize: '10px', color: colors.info, backgroundColor: '#EBF5FB', padding: '2px 5px', borderRadius: '4px' }}>{it.gender}</Text>}
                              {stCfg && <Text style={{ fontSize: '11px', fontWeight: 600, color: stCfg.color, backgroundColor: stCfg.bg, padding: '3px 6px', borderRadius: `${radius.xs}px` }}>{stCfg.label}</Text>}
                              {checked && status !== 'completed' && (
                                <View onClick={() => handleUpload(it)} style={{ padding: '4px 8px', borderRadius: `${radius.xs}px`, backgroundColor: colors.primary10, border: `1px solid ${colors.primary}30` }}>
                                  <Text style={{ fontSize: '12px', color: colors.primary, fontWeight: 600 }}>{uploading === it.id ? '上传中' : '上传'}</Text>
                                </View>
                              )}
                              {status === 'completed' && (
                                <View onClick={() => Taro.navigateTo({ url: '/pages/records/medical-reports/index' })} style={{ padding: '4px 8px', borderRadius: `${radius.xs}px`, backgroundColor: colors.info10 }}>
                                  <Text style={{ fontSize: '12px', color: colors.info, fontWeight: 600 }}>查看</Text>
                                </View>
                              )}
                            </View>
                          );
                        })}
                      </View>
                    ))}
                    <View style={{ height: `${spacing.sm}px` }} />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
