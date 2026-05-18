import { Platform } from 'react-native';

export const colors = {
  // Primary — 深森林绿，对标样图
  primary:      '#1E6B50',
  primaryLight: '#2D8A68',
  primaryDark:  '#155240',
  primary05: 'rgba(30,107,80,0.05)',
  primary10: 'rgba(30,107,80,0.08)',
  primary20: 'rgba(30,107,80,0.15)',

  // Accent
  accent:      '#2D8A68',
  accentLight: '#A8D5C2',
  accentDark:  '#155240',
  accent10: 'rgba(45,138,104,0.10)',

  // Semantic
  success:    '#22A06B',
  success10:  'rgba(34,160,107,0.10)',
  warning:    '#D97706',
  warning10:  'rgba(217,119,6,0.10)',
  danger:     '#DC3545',
  danger10:   'rgba(220,53,69,0.10)',
  info:       '#0077B6',
  info10:     'rgba(0,119,182,0.10)',

  // Backgrounds — 暖米白，对标样图
  background:  '#F2EDE3',
  surface:     '#FFFFFF',
  surfaceAlt:  '#FAF7F2',
  border:      '#E0D9CE',
  borderLight: '#EDE8E0',
  divider:     '#F0EAE0',

  // Text
  textPrimary:   '#1A2B24',
  textSecondary: '#4A6558',
  textMuted:     '#8AA89C',
  textDisabled:  '#C4D5CC',

  // Special
  white:   '#FFFFFF',
  black:   '#000000',
  overlay: 'rgba(0,30,20,0.50)',

  // Chart
  chartBlue:   '#0077B6',
  chartRed:    '#DC3545',
  chartGreen:  '#1E6B50',
  chartPurple: '#7C3AED',
};

export const typography = {
  display: { fontSize: 34, fontWeight: '800', color: '#1A2B24', letterSpacing: -1 },
  h1:      { fontSize: 28, fontWeight: '700', color: '#1A2B24', letterSpacing: -0.5 },
  h2:      { fontSize: 22, fontWeight: '700', color: '#1A2B24', letterSpacing: -0.3 },
  h3:      { fontSize: 18, fontWeight: '600', color: '#1A2B24' },
  h4:      { fontSize: 16, fontWeight: '600', color: '#1A2B24' },
  body1:   { fontSize: 15, color: '#4A6558', lineHeight: 23 },
  body2:   { fontSize: 13, color: '#4A6558', lineHeight: 20 },
  caption: { fontSize: 11, fontWeight: '500', color: '#8AA89C', letterSpacing: 0.2 },
  label:   { fontSize: 12, fontWeight: '600', color: '#4A6558', letterSpacing: 0.3 },
};

export const spacing = {
  xs: 4, sm: 8, md: 16, lg: 20, xl: 32, xxl: 48,
};

export const radius = {
  xs: 8, sm: 12, md: 16, lg: 20, xl: 28, full: 999,
};

export const shadow = {
  xs: { shadowColor: '#1A2B24', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  sm: { shadowColor: '#1A2B24', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  md: { shadowColor: '#1A2B24', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 },
  lg: { shadowColor: '#1A2B24', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.10, shadowRadius: 20, elevation: 5 },
  card: { shadowColor: '#1A2B24', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 3 },
};

export const gradient = {
  primary: { backgroundColor: '#1E6B50' },
  header:  { backgroundColor: '#1E6B50' },
  card:    { backgroundColor: '#1E6B50' },
  soft:    { backgroundColor: '#E8F5EF' },
  success: { backgroundColor: '#22A06B' },
  warning: { backgroundColor: '#D97706' },
  danger:  { backgroundColor: '#DC3545' },
};
