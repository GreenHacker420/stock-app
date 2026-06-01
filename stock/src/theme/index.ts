export const colors = {
  primary:        '#16a34a', // Elegant Emerald Green
  primaryLight:   '#dcfce7', // Soft green highlight tint
  primaryDark:    '#14532d', // Deep forest green
  primaryMid:     '#22c55e', // Vibrant mid green

  success:        '#16a34a',
  successLight:   '#dcfce7',
  danger:         '#dc2626',
  dangerLight:    '#fee2e2',
  warning:        '#d97706',
  warningLight:   '#fef3c7',
  info:           '#0284c7',
  infoLight:      '#e0f2fe',

  textPrimary:    '#111827', // Charcoal black
  textSecondary:  '#6b7280', // Cool gray
  textMuted:      '#9ca3af', // Light gray
  textInverse:    '#ffffff',
  textDisabled:   '#d1d5db',

  bg:             '#fbfcfb', // Off-white background
  surface:        '#ffffff',
  surfaceOffset:  '#f4f5f4', // Slightly offset clean gray-green
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
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;
