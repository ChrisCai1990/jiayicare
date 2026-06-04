import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, Modal, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, shadow } from '../../theme';
import { screeningAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

// ── 筛查分类目录（静态配置）────────────────────────────────────────
const CATALOG = [
  {
    key: 'tumor',
    label: '肿瘤风险筛查',
    icon: 'flask-outline',
    color: '#DC3545',
    items: [
      { id: 'tumor|肺癌|肺CT',              parent: '肺癌',           label: '肺CT',              gender: null },
      { id: 'tumor|结直肠癌|粪便隐血',      parent: '结直肠癌',       label: '粪便隐血',          gender: null },
      { id: 'tumor|结直肠癌|粪便基因检测',  parent: '结直肠癌',       label: '粪便基因检测',      gender: null },
      { id: 'tumor|结直肠癌|肠镜',          parent: '结直肠癌',       label: '肠镜',              gender: null },
      { id: 'tumor|结直肠癌|肠镜病理',      parent: '结直肠癌',       label: '肠镜病理',          gender: null },
      { id: 'tumor|肝癌|乙肝三系',          parent: '肝癌',           label: '乙肝三系',          gender: null },
      { id: 'tumor|肝癌|HBV-DNA',           parent: '肝癌',           label: 'HBV-DNA',           gender: null },
      { id: 'tumor|肝癌|丙肝两项',          parent: '肝癌',           label: '丙肝两项',          gender: null },
      { id: 'tumor|肝癌|肝脏超声',          parent: '肝癌',           label: '肝脏超声',          gender: null },
      { id: 'tumor|肝癌|肝脏磁共振',        parent: '肝癌',           label: '肝脏磁共振',        gender: null },
      { id: 'tumor|肝癌|肝脏纤维弹性超声',  parent: '肝癌',           label: '肝脏纤维弹性超声',  gender: null },
      { id: 'tumor|胃癌|碳13呼气试验',      parent: '胃癌',           label: '碳13呼气试验',      gender: null },
      { id: 'tumor|胃癌|胃蛋白酶原',        parent: '胃癌',           label: '胃蛋白酶原',        gender: null },
      { id: 'tumor|胃癌|胃泌素',            parent: '胃癌',           label: '胃泌素',            gender: null },
      { id: 'tumor|胃癌|胃镜',              parent: '胃癌',           label: '胃镜',              gender: null },
      { id: 'tumor|胃癌|胃镜病理',          parent: '胃癌',           label: '胃镜病理',          gender: null },
      { id: 'tumor|食管癌|胃食管镜',        parent: '食管癌',         label: '胃食管镜',          gender: null },
      { id: 'tumor|食管癌|食管镜病理',      parent: '食管癌',         label: '食管镜病理',        gender: null },
      { id: 'tumor|前列腺癌|前列腺超声',    parent: '前列腺癌',       label: '前列腺超声',        gender: '男' },
      { id: 'tumor|乳腺癌|乳腺超声',        parent: '乳腺癌',         label: '乳腺超声',          gender: '女' },
      { id: 'tumor|乳腺癌|乳腺钼靶',        parent: '乳腺癌',         label: '乳腺钼靶',          gender: '女' },
      { id: 'tumor|乳腺癌|乳腺磁共振',      parent: '乳腺癌',         label: '乳腺磁共振',        gender: '女' },
      { id: 'tumor|宫颈癌|HPV',             parent: '宫颈癌',         label: 'HPV',               gender: '女' },
      { id: 'tumor|宫颈癌|TCT',             parent: '宫颈癌',         label: 'TCT',               gender: '女' },
      { id: 'tumor|子宫内膜癌|阴道超声',    parent: '子宫内膜癌/卵巢癌', label: '阴道超声',       gender: '女' },
      { id: 'tumor|甲状腺癌|甲状腺超声',    parent: '甲状腺癌',       label: '甲状腺超声',        gender: null },
      { id: 'tumor|甲状腺癌|甲状腺穿刺',    parent: '甲状腺癌',       label: '甲状腺穿刺',        gender: null },
      { id: 'tumor|膀胱癌|尿常规',          parent: '膀胱癌',         label: '尿常规',            gender: null },
      { id: 'tumor|膀胱癌|膀胱超声',        parent: '膀胱癌',         label: '膀胱超声',          gender: null },
      { id: 'tumor|胰腺癌|胰腺超声',        parent: '胰腺癌',         label: '胰腺超声',          gender: null },
      { id: 'tumor|胰腺癌|胰腺MRI',         parent: '胰腺癌',         label: '胰腺MRI',           gender: null },
      { id: 'tumor|淋巴瘤|淋巴结超声',      parent: '淋巴瘤',         label: '淋巴结超声',        gender: null },
      { id: 'tumor|淋巴瘤|淋巴结磁共振',    parent: '淋巴瘤',         label: '淋巴结磁共振',      gender: null },
      { id: 'tumor|鼻咽癌|EB病毒IgA',       parent: '鼻咽癌',         label: 'EB病毒IgA',         gender: null },
      { id: 'tumor|鼻咽癌|EB病毒IgM',       parent: '鼻咽癌',         label: 'EB病毒IgM',         gender: null },
      { id: 'tumor|鼻咽癌|EB病毒IgG',       parent: '鼻咽癌',         label: 'EB病毒IgG',         gender: null },
      { id: 'tumor|鼻咽癌|鼻咽镜',          parent: '鼻咽癌',         label: '鼻咽镜',            gender: null },
      { id: 'tumor|肾癌|肾脏超声',          parent: '肾癌',           label: '肾脏超声',          gender: null },
      { id: 'tumor|肿瘤标志物|甲胎蛋白',    parent: '肿瘤标志物',     label: '甲胎蛋白',          gender: null },
      { id: 'tumor|肿瘤标志物|癌胚抗原',    parent: '肿瘤标志物',     label: '癌胚抗原',          gender: null },
      { id: 'tumor|肿瘤标志物|铁蛋白',      parent: '肿瘤标志物',     label: '铁蛋白',            gender: null },
      { id: 'tumor|肿瘤标志物|CA125',        parent: '肿瘤标志物',     label: 'CA125',             gender: '女' },
      { id: 'tumor|肿瘤标志物|CA19-9',       parent: '肿瘤标志物',     label: 'CA19-9',            gender: null },
      { id: 'tumor|肿瘤标志物|SCC',          parent: '肿瘤标志物',     label: 'SCC',               gender: null },
      { id: 'tumor|肿瘤标志物|NSE',          parent: '肿瘤标志物',     label: 'NSE',               gender: null },
      { id: 'tumor|肿瘤标志物|CYFRA21-1',    parent: '肿瘤标志物',     label: 'CYFRA21-1',         gender: null },
      { id: 'tumor|肿瘤标志物|ProGRP',       parent: '肿瘤标志物',     label: 'ProGRP',            gender: null },
      { id: 'tumor|肿瘤标志物|T-PSA',        parent: '肿瘤标志物',     label: 'T-PSA',             gender: '男' },
      { id: 'tumor|肿瘤标志物|F-PSA',        parent: '肿瘤标志物',     label: 'F-PSA',             gender: '男' },
      { id: 'tumor|肿瘤标志物|fPSA/tPSA',    parent: '肿瘤标志物',     label: 'fPSA/tPSA',         gender: '男' },
      { id: 'tumor|肿瘤标志物|TSGF',         parent: '肿瘤标志物',     label: 'TSGF',              gender: null },
      { id: 'tumor|肿瘤标志物|HCG',          parent: '肿瘤标志物',     label: 'HCG',               gender: null },
    ],
  },
  {
    key: 'cardiovascular',
    label: '心脑血管病风险筛查',
    icon: 'heart-outline',
    color: '#D97706',
    items: [
      { id: 'cardio|心脏筛查|脂蛋白磷脂酶A2', parent: '心脏筛查', label: '脂蛋白磷脂酶A2', gender: null },
      { id: 'cardio|心脏筛查|常规心电图',     parent: '心脏筛查', label: '常规心电图',     gender: null },
      { id: 'cardio|心脏筛查|动态心电图',     parent: '心脏筛查', label: '动态心电图',     gender: null },
      { id: 'cardio|心脏筛查|心脏超声',       parent: '心脏筛查', label: '心脏超声',       gender: null },
      { id: 'cardio|心脏筛查|冠脉CTA',        parent: '心脏筛查', label: '冠脉CTA',        gender: null },
      { id: 'cardio|心脏筛查|心脏磁共振',     parent: '心脏筛查', label: '心脏磁共振',     gender: null },
      { id: 'cardio|心脏筛查|运动平板',       parent: '心脏筛查', label: '运动平板',       gender: null },
      { id: 'cardio|大脑筛查|同型半胱氨酸',   parent: '大脑筛查', label: '同型半胱氨酸',   gender: null },
      { id: 'cardio|大脑筛查|颈动脉超声',     parent: '大脑筛查', label: '颈动脉超声',     gender: null },
      { id: 'cardio|大脑筛查|头颅MRI',        parent: '大脑筛查', label: '头颅MRI',        gender: null },
      { id: 'cardio|大脑筛查|颅脑MRA',        parent: '大脑筛查', label: '颅脑MRA',        gender: null },
      { id: 'cardio|其他|动脉硬化测定',       parent: '其他',     label: '动脉硬化测定',   gender: null },
    ],
  },
  {
    key: 'chronic',
    label: '慢性病筛查',
    icon: 'medical-outline',
    color: '#7C3AED',
    items: [
      { id: 'chronic|高血压|血压',                parent: '高血压筛查',   label: '血压',               gender: null },
      { id: 'chronic|高血压|动态血压',            parent: '高血压筛查',   label: '动态血压',           gender: null },
      { id: 'chronic|糖尿病|空腹血糖',            parent: '糖尿病筛查',   label: '空腹血糖',           gender: null },
      { id: 'chronic|糖尿病|糖化血红蛋白',        parent: '糖尿病筛查',   label: '糖化血红蛋白',       gender: null },
      { id: 'chronic|糖尿病|空腹胰岛素',          parent: '糖尿病筛查',   label: '空腹胰岛素',         gender: null },
      { id: 'chronic|糖尿病|空腹C肽',             parent: '糖尿病筛查',   label: '空腹C肽',            gender: null },
      { id: 'chronic|糖尿病|30分钟胰岛素C肽',     parent: '糖尿病筛查',   label: '30分钟胰岛素/C肽',   gender: null },
      { id: 'chronic|糖尿病|1小时胰岛素C肽',      parent: '糖尿病筛查',   label: '1小时胰岛素/C肽',    gender: null },
      { id: 'chronic|糖尿病|2小时胰岛素C肽',      parent: '糖尿病筛查',   label: '2小时胰岛素/C肽',    gender: null },
      { id: 'chronic|糖尿病|3小时胰岛素C肽',      parent: '糖尿病筛查',   label: '3小时胰岛素/C肽',    gender: null },
      { id: 'chronic|肝功能|肝功',               parent: '肝脏功能评估', label: '肝功',               gender: null },
      { id: 'chronic|肾功能|肾功能',             parent: '肾脏功能评估', label: '肾功能',             gender: null },
      { id: 'chronic|肾功能|尿微量白蛋白',       parent: '肾脏功能评估', label: '尿微量白蛋白',       gender: null },
      { id: 'chronic|肾功能|尿肌酐',             parent: '肾脏功能评估', label: '尿肌酐',             gender: null },
      { id: 'chronic|肾功能|尿微量白蛋白尿肌酐', parent: '肾脏功能评估', label: '尿微量白蛋白/尿肌酐', gender: null },
      { id: 'chronic|甲状腺|甲状腺功能7项',      parent: '甲状腺功能评估', label: '甲状腺功能7项',    gender: null },
      { id: 'chronic|甲状腺|甲状腺球蛋白',       parent: '甲状腺功能评估', label: '甲状腺球蛋白',     gender: null },
      { id: 'chronic|老年痴呆|综合筛查',         parent: '老年痴呆筛查', label: '综合筛查',           gender: null },
      { id: 'chronic|骨质疏松|综合筛查',         parent: '骨质疏松筛查', label: '综合筛查',           gender: null },
      { id: 'chronic|更年期|综合筛查',           parent: '更年期筛查',   label: '综合筛查',           gender: null },
    ],
  },
  {
    key: 'health_promote',
    label: '健康促进筛查',
    icon: 'leaf-outline',
    color: '#22A06B',
    items: [
      { id: 'hp|特殊检测|慢性食物过敏检测',   parent: '特殊检测', label: '慢性食物过敏检测',   gender: null },
      { id: 'hp|特殊检测|肠道菌群基因测序',   parent: '特殊检测', label: '肠道菌群基因测序',   gender: null },
      { id: 'hp|特殊检测|端粒长度检测',       parent: '特殊检测', label: '端粒长度检测',       gender: null },
      { id: 'hp|特殊检测|精准基因检测',       parent: '特殊检测', label: '精准基因检测',       gender: null },
      { id: 'hp|特殊检测|性别荷尔蒙检测',     parent: '特殊检测', label: '性别荷尔蒙检测',     gender: null },
      { id: 'hp|特殊检测|环境荷尔蒙检测',     parent: '特殊检测', label: '环境荷尔蒙检测',     gender: null },
      { id: 'hp|特殊检测|抗压力荷尔蒙检测',   parent: '特殊检测', label: '抗压力荷尔蒙检测',   gender: null },
      { id: 'hp|特殊检测|抗氧化维生素检测',   parent: '特殊检测', label: '抗氧化维生素检测',   gender: null },
      { id: 'hp|特殊检测|全套新陈代谢分析',   parent: '特殊检测', label: '全套新陈代谢分析',   gender: null },
      { id: 'hp|特殊检测|营养与重金属元素',   parent: '特殊检测', label: '营养与重金属元素',   gender: null },
      { id: 'hp|特殊检测|生长因子分析',       parent: '特殊检测', label: '生长因子分析',       gender: null },
      { id: 'hp|特殊检测|雌激素代谢分析',     parent: '特殊检测', label: '雌激素代谢分析',     gender: null },
      { id: 'hp|特殊检测|氧化压力分析',       parent: '特殊检测', label: '氧化压力分析',       gender: null },
      { id: 'hp|特殊检测|尿碘检测',           parent: '特殊检测', label: '尿碘检测',           gender: null },
    ],
  },
  {
    key: 'other',
    label: '其他筛查',
    icon: 'list-outline',
    color: '#6B7280',
    items: [
      { id: 'other|基础检查|血常规',        parent: '基础检查', label: '血常规',        gender: null },
      { id: 'other|基础检查|电解质',        parent: '基础检查', label: '电解质',        gender: null },
      { id: 'other|基础检查|25羟基维生素D', parent: '基础检查', label: '25-羟基维生素D', gender: null },
      { id: 'other|基础检查|凝血功能',      parent: '基础检查', label: '凝血功能',      gender: null },
      { id: 'other|基础检查|D二聚体',       parent: '基础检查', label: 'D-二聚体',      gender: null },
      { id: 'other|基础检查|传染病4项',     parent: '基础检查', label: '传染病4项',     gender: null },
    ],
  },
];

// ── 状态配置 ─────────────────────────────────────────────────────
const STATUS_CFG = {
  pending:   { label: '待检查',     bg: '#F3F4F6', color: '#8AA89C', icon: 'time-outline' },
  uploaded:  { label: '待审核',     bg: '#FEF3E2', color: '#D97706', icon: 'cloud-done-outline' },
  completed: { label: '已完成',     bg: '#E8F5EF', color: '#22A06B', icon: 'checkmark-circle-outline' },
};

// ── 按 parent 分组 ───────────────────────────────────────────────
function groupByParent(items) {
  const map = {};
  items.forEach(it => {
    if (!map[it.parent]) map[it.parent] = [];
    map[it.parent].push(it);
  });
  return Object.entries(map).map(([parent, checks]) => ({ parent, checks }));
}

// ── 上传文件选择（web only）─────────────────────────────────────
function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.jpg,.jpeg,.png';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return resolve(null);
      if (file.size > 20 * 1024 * 1024) {
        alert('文件不能超过 20MB');
        return resolve(null);
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target.result.split(',')[1];
        const sizeStr = file.size > 1024 * 1024
          ? `${(file.size / 1024 / 1024).toFixed(1)}MB`
          : `${(file.size / 1024).toFixed(0)}KB`;
        resolve({ content: base64, mimeType: file.type, sizeStr, name: file.name });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

export default function SpecialScreeningScreen({ navigation }) {
  const { user } = useAuth();
  const gender = user?.gender || null;

  const [userItems, setUserItems]       = useState({}); // itemId → { _id, status, reportId }
  const [expandedCats, setExpandedCats] = useState({ tumor: true });
  const [loading, setLoading]           = useState(true);
  const [refreshing, setRefreshing]     = useState(false);

  // 上传 modal
  const [uploadModal, setUploadModal]   = useState(null); // { item: catalog item, dbItem: UserScreeningItem }
  const [uploading, setUploading]       = useState(false);

  // ── 加载用户已选项 ────────────────────────────────────────────
  const loadItems = useCallback(async () => {
    try {
      const res = await screeningAPI.list();
      const map = {};
      (res.data || []).forEach(it => { map[it.itemId] = it; });
      setUserItems(map);
    } catch (e) {
      console.error('加载筛查项失败', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadItems(); }, [loadItems]);

  const onRefresh = useCallback(() => { setRefreshing(true); loadItems(); }, [loadItems]);

  // ── 选中 / 取消选中一个项目 ──────────────────────────────────
  const toggleItem = useCallback(async (catKey, item) => {
    const existing = userItems[item.id];
    if (existing) {
      // 如果已上传报告，不允许取消
      if (existing.status !== 'pending') return;
      try {
        await screeningAPI.deselect(existing._id);
        setUserItems(prev => { const n = { ...prev }; delete n[item.id]; return n; });
      } catch (e) {
        alert('操作失败：' + e.message);
      }
    } else {
      try {
        const res = await screeningAPI.select({
          itemId: item.id,
          category: catKey,
          parentLabel: item.parent,
          itemLabel: item.label,
        });
        setUserItems(prev => ({ ...prev, [item.id]: res.data }));
      } catch (e) {
        alert('操作失败：' + e.message);
      }
    }
  }, [userItems]);

  // ── 上传报告 ──────────────────────────────────────────────────
  const handleUpload = useCallback(async (catItem) => {
    const dbItem = userItems[catItem.id];
    if (!dbItem) {
      // 先自动选中
      try {
        const catKey = CATALOG.find(c => c.items.some(i => i.id === catItem.id))?.key || '';
        const res = await screeningAPI.select({
          itemId: catItem.id,
          category: catKey,
          parentLabel: catItem.parent,
          itemLabel: catItem.label,
        });
        setUserItems(prev => ({ ...prev, [catItem.id]: res.data }));
        setUploadModal({ item: catItem, dbItem: res.data });
      } catch (e) {
        alert('操作失败：' + e.message);
      }
      return;
    }
    setUploadModal({ item: catItem, dbItem });
  }, [userItems]);

  const confirmUpload = useCallback(async () => {
    if (!uploadModal) return;
    setUploading(true);
    try {
      const fileData = await pickFile();
      if (!fileData) { setUploading(false); return; }

      await screeningAPI.upload(uploadModal.dbItem._id, {
        title: `${uploadModal.item.parent} · ${uploadModal.item.label}`,
        content: fileData.content,
        mimeType: fileData.mimeType,
        fileSize: fileData.sizeStr,
        pages: 1,
        date: new Date().toISOString().slice(0, 10),
      });

      await loadItems();
      setUploadModal(null);
    } catch (e) {
      alert('上传失败：' + e.message);
    } finally {
      setUploading(false);
    }
  }, [uploadModal, loadItems]);

  // ── 切换分类展开 ──────────────────────────────────────────────
  const toggleCat = (key) => {
    setExpandedCats(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ── 过滤：按性别 ──────────────────────────────────────────────
  const filterItems = (items) => {
    if (!gender) return items;
    return items.filter(it => !it.gender || it.gender === gender);
  };

  // ── 统计：各分类完成情况 ──────────────────────────────────────
  const getCatStats = (catKey, items) => {
    const filtered = filterItems(items);
    const selected = filtered.filter(it => userItems[it.id]);
    const done     = selected.filter(it => userItems[it.id]?.status === 'completed');
    return { total: filtered.length, selected: selected.length, done: done.length };
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>专项筛查</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 顶部导航 */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>专项筛查</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* 说明 */}
      <View style={styles.tipBar}>
        <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
        <Text style={styles.tipText}>勾选检查项目并上传报告，系统将与您的健康档案关联。</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {CATALOG.map((cat) => {
          const stats   = getCatStats(cat.key, cat.items);
          const isOpen  = expandedCats[cat.key];
          const groups  = groupByParent(filterItems(cat.items));

          return (
            <View key={cat.key} style={styles.section}>
              {/* 分类标题 */}
              <TouchableOpacity style={styles.catHeader} onPress={() => toggleCat(cat.key)} activeOpacity={0.7}>
                <View style={[styles.catIcon, { backgroundColor: cat.color + '18' }]}>
                  <Ionicons name={cat.icon} size={18} color={cat.color} />
                </View>
                <View style={styles.catTitleCol}>
                  <Text style={styles.catLabel}>{cat.label}</Text>
                  <Text style={styles.catStat}>
                    已选 {stats.selected} · 已完成 {stats.done}/{stats.total}
                  </Text>
                </View>
                <Ionicons
                  name={isOpen ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.textMuted}
                />
              </TouchableOpacity>

              {/* 展开内容 */}
              {isOpen && (
                <View style={styles.catBody}>
                  {groups.map(({ parent, checks }) => (
                    <View key={parent} style={styles.parentGroup}>
                      <Text style={styles.parentLabel}>{parent}</Text>
                      {checks.map((it, idx) => {
                        const dbItem  = userItems[it.id];
                        const checked = !!dbItem;
                        const status  = dbItem?.status || null;
                        const stCfg   = status ? STATUS_CFG[status] : null;
                        const isLast  = idx === checks.length - 1;

                        return (
                          <View key={it.id} style={[styles.checkRow, !isLast && styles.checkRowBorder]}>
                            {/* 复选框 */}
                            <TouchableOpacity
                              style={[styles.checkbox, checked && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                              onPress={() => toggleItem(cat.key, it)}
                              disabled={status === 'uploaded' || status === 'completed'}
                            >
                              {checked && <Ionicons name="checkmark" size={12} color={colors.white} />}
                            </TouchableOpacity>

                            {/* 项目名称 */}
                            <Text style={[styles.checkLabel, !checked && { color: colors.textMuted }]}>
                              {it.label}
                            </Text>

                            {/* 性别标记 */}
                            {it.gender && (
                              <View style={styles.genderBadge}>
                                <Text style={styles.genderText}>{it.gender}</Text>
                              </View>
                            )}

                            {/* 状态 & 操作 */}
                            <View style={styles.checkActions}>
                              {stCfg && (
                                <View style={[styles.statusBadge, { backgroundColor: stCfg.bg }]}>
                                  <Ionicons name={stCfg.icon} size={11} color={stCfg.color} />
                                  <Text style={[styles.statusText, { color: stCfg.color }]}>{stCfg.label}</Text>
                                </View>
                              )}
                              {checked && status !== 'completed' && (
                                <TouchableOpacity
                                  style={styles.uploadBtn}
                                  onPress={() => handleUpload(it)}
                                >
                                  <Ionicons name="cloud-upload-outline" size={13} color={colors.primary} />
                                  <Text style={styles.uploadBtnText}>上传</Text>
                                </TouchableOpacity>
                              )}
                              {status === 'completed' && (
                                <TouchableOpacity style={styles.viewBtn}>
                                  <Ionicons name="eye-outline" size={13} color={colors.info} />
                                  <Text style={styles.viewBtnText}>查看</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* 上传确认 Modal */}
      <Modal visible={!!uploadModal} transparent animationType="fade" onRequestClose={() => setUploadModal(null)}>
        <View style={styles.overlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>上传检查报告</Text>
            <Text style={styles.modalSub}>
              {uploadModal?.item.parent} · {uploadModal?.item.label}
            </Text>
            <Text style={styles.modalHint}>
              支持 PDF、JPG、PNG 格式，文件不超过 20MB。
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setUploadModal(null)} disabled={uploading}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={confirmUpload} disabled={uploading}>
                {uploading
                  ? <ActivityIndicator color={colors.white} size="small" />
                  : <Text style={styles.confirmBtnText}>选择文件</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.background },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: 12, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn:      { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle:  { fontSize: 17, fontWeight: '700', color: colors.textPrimary },

  tipBar:       { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: 10, backgroundColor: '#F0F4F8' },
  tipText:      { flex: 1, fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  scroll:       { padding: spacing.md, gap: spacing.sm },

  section:      { backgroundColor: colors.white, borderRadius: radius.md, ...shadow.card, overflow: 'hidden' },
  catHeader:    { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm },
  catIcon:      { width: 36, height: 36, borderRadius: radius.xs, justifyContent: 'center', alignItems: 'center' },
  catTitleCol:  { flex: 1 },
  catLabel:     { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  catStat:      { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  catBody:      { borderTopWidth: 1, borderTopColor: colors.border },
  parentGroup:  { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  parentLabel:  { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, paddingLeft: 4 },

  checkRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8, minHeight: 44 },
  checkRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  checkbox:     { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.white },
  checkLabel:   { flex: 1, fontSize: 13, color: colors.textPrimary },

  genderBadge:  { paddingHorizontal: 5, paddingVertical: 2, backgroundColor: '#EBF5FB', borderRadius: 4 },
  genderText:   { fontSize: 10, color: colors.info, fontWeight: '600' },

  checkActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusBadge:  { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: radius.xs },
  statusText:   { fontSize: 11, fontWeight: '600' },

  uploadBtn:    { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.xs, backgroundColor: colors.primary + '12', borderWidth: 1, borderColor: colors.primary + '30' },
  uploadBtnText:{ fontSize: 12, color: colors.primary, fontWeight: '600' },
  viewBtn:      { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.xs, backgroundColor: colors.info + '12' },
  viewBtnText:  { fontSize: 12, color: colors.info, fontWeight: '600' },

  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalCard:    { backgroundColor: colors.white, borderRadius: radius.lg, padding: spacing.lg, width: '100%', maxWidth: 360 },
  modalTitle:   { fontSize: 17, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  modalSub:     { fontSize: 14, color: colors.textSecondary, marginBottom: spacing.sm },
  modalHint:    { fontSize: 12, color: colors.textMuted, lineHeight: 18, marginBottom: spacing.lg },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  cancelBtn:    { flex: 1, paddingVertical: 12, borderRadius: radius.sm, backgroundColor: colors.background, alignItems: 'center' },
  cancelBtnText:{ fontSize: 15, color: colors.textSecondary, fontWeight: '600' },
  confirmBtn:   { flex: 1, paddingVertical: 12, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center' },
  confirmBtnText:{ fontSize: 15, color: colors.white, fontWeight: '700' },
});
