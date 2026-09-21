export const colors = {
  primary: '#00AAD2',
  primaryLight: '#66D9F1',
  secondary: '#0F172A',
  accent: '#00AAD2',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  background: '#0B1220',
  surface: '#111827',
  surfaceAlt: '#1F2937',
  surfaceElevated: '#162133',
  surfaceSoft: '#0F1B2D',
  text: '#F8FAFC',
  textSecondary: '#CBD5E1',
  textLight: '#94A3B8',
  border: '#243041',
  borderLight: '#334155',
  white: '#FFFFFF',
  black: '#000000',

  // Status colors
  statusPending: '#F59E0B',
  statusConfirmed: '#38BDF8',
  statusInProgress: '#A78BFA',
  statusCompleted: '#22C55E',

  // Car mode (dark theme)
  carBg: '#0A0A0F',
  carSurface: '#1A1A2E',
  carText: '#FFFFFF',
  carAccent: '#00AAD2',
  carBorder: '#2A2A3E',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  medium: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  small: 8,
  large: 16,
};

export const radius = {
  sm: 8,
  md: 12,
  medium: 12,
  lg: 16,
  xl: 20,
  full: 999,
  small: 8,
  large: 16,
};

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
};

export const fonts = {
  regular: { fontSize: 14, color: colors.text },
  medium: { fontSize: 16, fontWeight: '500' as const, color: colors.text },
  semibold: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  bold: { fontSize: 18, fontWeight: '700' as const, color: colors.text },
  title: { fontSize: 24, fontWeight: '700' as const, color: colors.text },
  hero: { fontSize: 28, fontWeight: '800' as const, color: colors.text },
};

export const theme = {
  colors,
  spacing,
  radius,
  shadows,
  fonts,
  regular: fonts.regular,
  medium: fonts.medium,
  semibold: fonts.semibold,
  bold: fonts.bold,
  title: fonts.title,
  hero: fonts.hero,
};

export default theme;