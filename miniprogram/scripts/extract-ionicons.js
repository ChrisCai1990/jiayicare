// 从 ionicons 官方包（app 端 @expo/vector-icons 底层就是 Ionicons 字体，本包提供同名图标的原始 SVG 源）
// 提取 app 端各页面实际用到的图标名，生成 src/components/ionicons.js（格式对齐现有 iconSvgs.js）。
// 用法：node scripts/extract-ionicons.js
// 新增图标名时：把名字加进下面 ICON_NAMES 数组，重新跑这个脚本即可，不用手抄SVG源码。
const fs = require('fs');
const path = require('path');

// app 端 Ionicons 图标名清单，来自 grep app/src/screens/**/*.js 里 `Ionicons name="..."` 静态字符串
// 和角色/分类配置对象里的 icon 字段（HomeScreen.js 的 TEAM_ROLE_CONFIG/REM_CAT_META/TEAM_ROW_CONFIG）
const ICON_NAMES = [
  // 通用 UI
  'add', 'add-circle', 'arrow-back', 'chevron-back', 'chevron-forward',
  'checkmark', 'checkmark-circle', 'checkmark-circle-outline', 'close',
  'document-outline', 'list-outline', 'log-out-outline',
  'notifications-off-outline', 'notifications-outline',
  'pencil-outline', 'send', 'shield-checkmark', 'sparkles',
  'trending-up-outline', 'volume-high-outline',
  'bag-outline', 'card-outline', 'wallet-outline',
  'people', 'people-outline', 'person-outline',
  // 首页：健康团队角色图标（TEAM_ROLE_CONFIG / TEAM_ROW_CONFIG）
  'medical-outline', 'nutrition-outline', 'briefcase-outline',
  'happy-outline', 'fitness-outline', 'leaf-outline', 'medkit-outline',
  'compass-outline', 'analytics-outline', 'sunny-outline',
  // 首页：提醒分类图标（REM_CAT_META）
  'alert-circle-outline', 'pulse-outline', 'search-outline',
  'shield-outline', 'scale-outline', 'moon-outline', 'warning-outline',
  // 首页：待办任务类型图标（TASK_ICON_CONFIG，小程序端沿用旧结构，补充这几个）
  'call-outline', 'flask-outline', 'chatbubble-outline',
  // 首页：成长打卡卡片专属（app端新模型已移除该卡片，小程序端暂保留，语义相近的图标补充）
  'flame-outline', 'arrow-down-outline',
];

const SVG_DIR = path.join(__dirname, '..', '..', 'node_modules', 'ionicons', 'dist', 'svg');
const OUT_FILE = path.join(__dirname, '..', 'src', 'components', 'ionicons.js');

if (!fs.existsSync(SVG_DIR)) {
  console.error(`找不到 ionicons SVG 目录：${SVG_DIR}\n请先在 monorepo 根目录跑 npm install（workspaces 会把 ionicons 装到根 node_modules）。`);
  process.exit(1);
}

const entries = [];
const missing = [];
for (const name of ICON_NAMES) {
  const filePath = path.join(SVG_DIR, `${name}.svg`);
  if (!fs.existsSync(filePath)) {
    missing.push(name);
    continue;
  }
  const raw = fs.readFileSync(filePath, 'utf-8').trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
  entries.push(`  "${name}": ${JSON.stringify(raw)},`);
}

if (missing.length > 0) {
  console.warn('以下图标名在 ionicons 包里找不到对应 svg 文件，请检查拼写（app 端截图确认过的名字应该都存在）：');
  missing.forEach((n) => console.warn(`  - ${n}`));
}

const header = `// 自动生成：从 ionicons 官方包(node_modules/ionicons/dist/svg/)提取的 app 端同名图标 SVG 源码
// app 端 @expo/vector-icons 的 Ionicons 字体图标，与本文件里的矢量路径是同一套设计（同名同形）。
// stroke="currentColor" 原样保留，Icon 组件运行时替换成实际颜色（用法与 iconSvgs.js 完全一致）。
// 重新生成：node scripts/extract-ionicons.js（改 ICON_NAMES 数组增删图标后重跑）
export default {\n`;
const footer = `\n};\n`;

fs.writeFileSync(OUT_FILE, header + entries.join('\n') + footer, 'utf-8');
console.log(`已生成 ${OUT_FILE}，共 ${entries.length} 个图标${missing.length ? `，${missing.length} 个缺失` : ''}。`);
