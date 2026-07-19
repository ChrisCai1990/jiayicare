// 小程序端主题变量 —— 数值与 app/src/theme/index.js 保持一致，
// 阴影从 RN 的 shadowColor/shadowOffset/shadowOpacity/shadowRadius 转换为小程序支持的 boxShadow 写法。

export const colors = {
  primary: '#C9A86A',
  primaryLight: '#DDC28C',
  primaryDark: '#A6874F',
  primary05: 'rgba(201,168,106,0.05)',
  primary10: 'rgba(201,168,106,0.10)',
  primary20: 'rgba(201,168,106,0.18)',

  accent: '#DDC28C',
  accentLight: '#EEDFC0',
  accentDark: '#A6874F',
  accent10: 'rgba(221,194,140,0.12)',

  success: '#4CAF7D',
  success10: 'rgba(76,175,125,0.12)',
  warning: '#E0A64B',
  warning10: 'rgba(224,166,75,0.12)',
  danger: '#E0605C',
  danger10: 'rgba(224,96,92,0.12)',
  info: '#5B9BD5',
  info10: 'rgba(91,155,213,0.12)',

  background: '#0F1215',
  surface: '#1A1E23',
  surfaceAlt: '#22262C',
  border: 'rgba(201,168,106,0.16)',
  borderLight: 'rgba(255,255,255,0.08)',
  divider: 'rgba(255,255,255,0.06)',

  // 磨砂玻璃卡片：小程序端配合 backdrop-filter 使用可出真毛玻璃效果
  glass: 'rgba(255,255,255,0.05)',
  glassBorder: 'rgba(201,168,106,0.22)',
  glassHighlight: 'rgba(255,255,255,0.08)',

  textPrimary: '#F5EFE3',
  textSecondary: '#B9AF9E',
  textMuted: '#7E7669',
  textDisabled: '#4A463F',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,0,0,0.65)',

  chartBlue: '#5B9BD5',
  chartRed: '#E0605C',
  chartGreen: '#4CAF7D',
  chartPurple: '#A78BFA',
};

export const spacing = { xs: 6, sm: 12, md: 20, lg: 28, xl: 40, xxl: 56 };

export const radius = { xs: 8, sm: 14, md: 18, lg: 22, xl: 30, full: 999 };

// 小程序 CSS 用 boxShadow 字符串：'offsetX offsetY blurRadius color'
export const shadow = {
  xs: '0px 1px 4px rgba(0,0,0,0.20)',
  sm: '0px 3px 10px rgba(0,0,0,0.24)',
  md: '0px 6px 20px rgba(0,0,0,0.28)',
  lg: '0px 8px 28px rgba(0,0,0,0.32)',
  card: '0px 4px 16px rgba(0,0,0,0.26)',
};

// 磨砂玻璃卡片标准样式：style={{ ...glassCard, backdropFilter: 'blur(20px)' }}
// backdropFilter 需基础库 2.30.4+ / 微信客户端 8.0.24+ 才生效，低版本自动降级为纯色卡片，不影响可用性
export const glassCard = {
  backgroundColor: colors.glass,
  borderWidth: '1px',
  borderStyle: 'solid',
  borderColor: colors.glassBorder,
  backdropFilter: 'blur(20px)',
};

export const typography = {
  display: { fontSize: '32px', fontWeight: 700, color: '#F5EFE3' },
  h1: { fontSize: '26px', fontWeight: 600, color: '#F5EFE3' },
  h2: { fontSize: '20px', fontWeight: 600, color: '#F5EFE3' },
  h3: { fontSize: '16px', fontWeight: 600, color: '#F5EFE3' },
  h4: { fontSize: '14px', fontWeight: 600, color: '#F5EFE3' },
  body1: { fontSize: '14px', color: '#B9AF9E' },
  body2: { fontSize: '12px', color: '#B9AF9E' },
  caption: { fontSize: '10px', fontWeight: 500, color: '#7E7669' },
  label: { fontSize: '11px', fontWeight: 600, color: '#B9AF9E' },
};
