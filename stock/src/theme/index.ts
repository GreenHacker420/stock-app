export const colors = {
  primary:        '#1e40af',
  primaryLight:   '#dbeafe',
  primaryDark:    '#1e3a8a',
  primaryMid:     '#3b82f6',

  success:        '#059669',
  successLight:   '#d1fae5',
  danger:         '#dc2626',
  dangerLight:    '#fee2e2',
  warning:        '#d97706',
  warningLight:   '#fef3c7',
  info:           '#0284c7',
  infoLight:      '#e0f2fe',

  textPrimary:    '#111827',
  textSecondary:  '#6b7280',
  textMuted:      '#9ca3af',
  textInverse:    '#ffffff',
  textDisabled:   '#d1d5db',

  bg:             '#f9fafb',
  surface:        '#ffffff',
  surfaceOffset:  '#f3f4f6',
  surfaceDark:    '#e5e7eb',
  border:         '#e5e7eb',
  borderStrong:   '#d1d5db',

  overlay:        'rgba(0,0,0,0.5)',
} as const;

export const spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
  huge: 48,
} as const;

export const radius = {
  sm:   6,
  md:   10,
  lg:   14,
  xl:   20,
  xxl:  28,
  full: 9999,
} as const;

export const fontSize = {
  xs:   11,
  sm:   13,
  md:   15,
  lg:   17,
  xl:   20,
  xxl:  24,
  xxxl: 30,
  huge: 38,
} as const;

export const fontWeight = {
  regular:   '400' as const,
  medium:    '500' as const,
  semibold:  '600' as const,
  bold:      '700' as const,
  extrabold: '800' as const,
  black:     '900' as const,
};

export const shadow = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    elevation: 5,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 10,
  },
} as const;
