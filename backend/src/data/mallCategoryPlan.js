// Existing public catalogue, reviewed on 2026-10-13. Product names are used as
// stable migration keys only after the script verifies uniqueness and coverage.
const tree = [
  { name: '就医与咨询', children: ['就医服务', '心理咨询', '综合健康咨询'] },
  { name: '检测与评估', children: ['体检与报告', '健康监测', '功能医学检测', '基因检测'] },
  { name: '健康管理', children: ['营养管理', '运动复健', '专病管理', '年度健康管理'] },
  { name: '营养与食养', children: ['营养素补充', '药食同源'] },
  { name: '健康用品', children: ['健康设备', '运动复健用品'] },
];

const productsByCategory = {
  就医服务: [
    '医务代办服务', '医疗代诊服务', '专家约诊服务', '就医规划服务', '就医陪同服务',
    '门诊一站式服务', '全专联合远程会诊', '住院一站式服务', '全专联合会诊（到店）',
    '胃肠镜安心服务', '其他城市服务咨询',
  ],
  心理咨询: ['心理咨询服务', '心理健康陪伴'],
  综合健康咨询: ['轻咨询计划', '企业家健康决策计划', '健康档案管家'],
  体检与报告: ['健康体检服务', '体检一站式服务', '体检报告解读'],
  健康监测: ['动态血糖监测评估', '动态血压监测', '动态心电监测（单导联）'],
  基因检测: [
    '精准基因检测', '降压药基因检测', '内分泌疾病用药基因检测',
    '戒烟替代药物基因检测', '心肌病panel基因检测', '心血管用药基因检测', '端粒长度检测',
  ],
  运动复健: ['首次运动能力评估', '运动指导与复健训练'],
  营养管理: ['体重管理服务', '营养改变生活', '营养评估服务', '科学减重咨询'],
  专病管理: [
    'IBD 年度专病管理服务', '慢性病改善服务', '糖尿病前期健康管理计划',
    '更年期舒适生活｜阴道与泌尿生殖健康90天管理',
    '更年期舒适生活｜6个月持续管理（续约）',
    '儿童/青少年甲亢90天随访陪伴', '围绝经期健康管理计划',
  ],
  年度健康管理: [
    '365会员专享就医协助自选服务包', '健康预防计划', '健康维稳计划',
    '健康重塑计划', '健康年轻态计划', '年度营养管理服务', '轻享健康计划',
    '健康护航计划（企业）', '健康护航计划（个人)', '艾维口腔365会员年卡',
  ],
  营养素补充: [
    '纾炏宁®口溶粉', '维生素D（UGN）', '维生素D（metagenics）',
    '叶酸片（metagenics）', '活力益生菌咀嚼片（UGN）',
    '维生素D1000IU（metagenics）',
  ],
  健康设备: ['单导联动态心电监测仪（家庭长期使用）'],
};

const plannedCategoryByName = new Map();
for (const [category, names] of Object.entries(productsByCategory)) {
  for (const name of names) {
    if (plannedCategoryByName.has(name)) throw new Error(`重复商品：${name}`);
    plannedCategoryByName.set(name, category);
  }
}

module.exports = { tree, productsByCategory, plannedCategoryByName };
