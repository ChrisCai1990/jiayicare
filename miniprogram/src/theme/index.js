// 小程序端主题变量 —— 数值与 app/src/theme/index.js 保持一致，
// 阴影从 RN 的 shadowColor/shadowOffset/shadowOpacity/shadowRadius 转换为小程序支持的 boxShadow 写法。

export const colors = {
  primary: '#1E6B50',
  primaryLight: '#2D8A68',
  primaryDark: '#155240',
  primary05: 'rgba(30,107,80,0.05)',
  primary10: 'rgba(30,107,80,0.08)',
  primary20: 'rgba(30,107,80,0.15)',

  accent: '#2D8A68',
  accentLight: '#A8D5C2',
  accentDark: '#155240',
  accent10: 'rgba(45,138,104,0.10)',

  success: '#22A06B',
  success10: 'rgba(34,160,107,0.10)',
  warning: '#D97706',
  warning10: 'rgba(217,119,6,0.10)',
  danger: '#DC3545',
  danger10: 'rgba(220,53,69,0.10)',
  info: '#0077B6',
  info10: 'rgba(0,119,182,0.10)',

  background: '#F2EDE3',
  surface: '#FFFFFF',
  surfaceAlt: '#FAF7F2',
  border: '#E0D9CE',
  borderLight: '#EDE8E0',
  divider: '#F0EAE0',

  textPrimary: '#1A2B24',
  textSecondary: '#4A6558',
  textMuted: '#8AA89C',
  textDisabled: '#C4D5CC',

  white: '#FFFFFF',
  black: '#000000',
  overlay: 'rgba(0,30,20,0.50)',

  chartBlue: '#0077B6',
  chartRed: '#DC3545',
  chartGreen: '#1E6B50',
  chartPurple: '#7C3AED',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 20, xl: 32, xxl: 48 };

export const radius = { xs: 8, sm: 12, md: 16, lg: 20, xl: 28, full: 999 };

// 小程序 CSS 用 boxShadow 字符串：'offsetX offsetY blurRadius color'
export const shadow = {
  xs: '0px 1px 3px rgba(26,43,36,0.04)',
  sm: '0px 2px 8px rgba(26,43,36,0.06)',
  md: '0px 4px 16px rgba(26,43,36,0.08)',
  lg: '0px 6px 20px rgba(26,43,36,0.10)',
  card: '0px 2px 10px rgba(26,43,36,0.06)',
};

export const typography = {
  display: { fontSize: '34px', fontWeight: 800, color: '#1A2B24' },
  h1: { fontSize: '28px', fontWeight: 700, color: '#1A2B24' },
  h2: { fontSize: '22px', fontWeight: 700, color: '#1A2B24' },
  h3: { fontSize: '18px', fontWeight: 600, color: '#1A2B24' },
  h4: { fontSize: '16px', fontWeight: 600, color: '#1A2B24' },
  body1: { fontSize: '15px', color: '#4A6558' },
  body2: { fontSize: '13px', color: '#4A6558' },
  caption: { fontSize: '11px', fontWeight: 500, color: '#8AA89C' },
  label: { fontSize: '12px', fontWeight: 600, color: '#4A6558' },
};
