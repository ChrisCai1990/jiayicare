import { Platform } from 'react-native';

export const colors = {
  // Primary — 香槟金，金伊森高端定位
  primary:      '#C9A86A',
  primaryLight: '#DDC28C',
  primaryDark:  '#A6874F',
  primary05: 'rgba(201,168,106,0.05)',
  primary10: 'rgba(201,168,106,0.10)',
  primary20: 'rgba(201,168,106,0.18)',

  // Accent
  accent:      '#DDC28C',
  accentLight: '#EEDFC0',
  accentDark:  '#A6874F',
  accent10: 'rgba(221,194,140,0.12)',

  // Semantic
  success:    '#4CAF7D',
  success10:  'rgba(76,175,125,0.12)',
  warning:    '#E0A64B',
  warning10:  'rgba(224,166,75,0.12)',
  danger:     '#E0605C',
  danger10:   'rgba(224,96,92,0.12)',
  info:       '#5B9BD5',
  info10:     'rgba(91,155,213,0.12)',

  // Backgrounds — 深色基调
  background:  '#0F1215',
  surface:     '#1A1E23',
  surfaceAlt:  '#22262C',
  border:      'rgba(201,168,106,0.16)',
  borderLight: 'rgba(255,255,255,0.08)',
  divider:     'rgba(255,255,255,0.06)',

  // 磨砂玻璃卡片（React Native 无 backdrop-filter，用半透明底色+细描边模拟质感）
  glass:       'rgba(255,255,255,0.05)',
  glassBorder: 'rgba(201,168,106,0.22)',
  glassHighlight: 'rgba(255,255,255,0.08)',

  // Text
  textPrimary:   '#F5EFE3',
  textSecondary: '#B9AF9E',
  textMuted:     '#7E7669',
  textDisabled:  '#4A463F',

  // Special
  white:   '#FFFFFF',
  black:   '#000000',
  overlay: 'rgba(0,0,0,0.65)',

  // Chart
  chartBlue:   '#5B9BD5',
  chartRed:    '#E0605C',
  chartGreen:  '#4CAF7D',
  chartPurple: '#A78BFA',
};

// 精致小字：整体字号比原版略收，字重更轻，字间距略放，读起来更克制
export const typography = {
  display: { fontSize: 32, fontWeight: '700', color: '#F5EFE3', letterSpacing: 0.2 },
  h1:      { fontSize: 26, fontWeight: '600', color: '#F5EFE3', letterSpacing: 0.1 },
  h2:      { fontSize: 20, fontWeight: '600', color: '#F5EFE3', letterSpacing: 0.1 },
  h3:      { fontSize: 16, fontWeight: '600', color: '#F5EFE3', letterSpacing: 0.1 },
  h4:      { fontSize: 14, fontWeight: '600', color: '#F5EFE3', letterSpacing: 0.2 },
  body1:   { fontSize: 14, color: '#B9AF9E', lineHeight: 22, letterSpacing: 0.1 },
  body2:   { fontSize: 12, color: '#B9AF9E', lineHeight: 19, letterSpacing: 0.1 },
  caption: { fontSize: 10, fontWeight: '500', color: '#7E7669', letterSpacing: 0.4 },
  label:   { fontSize: 11, fontWeight: '600', color: '#B9AF9E', letterSpacing: 0.5 },
};

// 大量留白：间距整体上调一档
export const spacing = {
  xs: 6, sm: 12, md: 20, lg: 28, xl: 40, xxl: 56,
};

export const radius = {
  xs: 8, sm: 14, md: 18, lg: 22, xl: 30, full: 999,
};

export const shadow = {
  xs: { shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.20, shadowRadius: 4, elevation: 1 },
  sm: { shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.24, shadowRadius: 10, elevation: 3 },
  md: { shadowColor: '#000000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.28, shadowRadius: 20, elevation: 6 },
  lg: { shadowColor: '#000000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.32, shadowRadius: 28, elevation: 8 },
  card: { shadowColor: '#000000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.26, shadowRadius: 16, elevation: 4 },
};

// 磨砂玻璃卡片标准样式，各屏幕可直接展开使用：
// <View style={[styles.card, glassCard]}>
export const glassCard = {
  backgroundColor: colors.glass,
  borderWidth: 1,
  borderColor: colors.glassBorder,
};

export const gradient = {
  primary: { backgroundColor: '#C9A86A' },
  header:  { backgroundColor: '#14171B' },
  card:    { backgroundColor: '#1A1E23' },
  soft:    { backgroundColor: 'rgba(201,168,106,0.10)' },
  success: { backgroundColor: '#4CAF7D' },
  warning: { backgroundColor: '#E0A64B' },
  danger:  { backgroundColor: '#E0605C' },
};
