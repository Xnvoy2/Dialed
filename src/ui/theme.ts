import { TextStyle } from 'react-native';

/** Charcoal and white. No accent colour by design. */
export const colors = {
  bg: '#111112',
  surface: '#1C1C1E',
  surfaceRaised: '#2A2A2D',
  surfacePressed: '#313134',
  border: '#262629',
  borderStrong: '#3E3E43',
  track: '#2C2C2F',
  text: '#FFFFFF',
  secondary: '#A1A1A6',
  tertiary: '#6E6E73',
  onPrimary: '#121213',
  dock: 'rgba(36,36,39,0.86)',
  dockActive: 'rgba(255,255,255,0.10)',
} as const;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const radius = { s: 10, m: 14, l: 22, pill: 999 } as const;
export const SIDE = 16;
/** Gap between stacked tiles. */
export const TILE_GAP = 10;
export const MIN_TOUCH = 44;

export type Variant =
  | 'largeTitle'
  | 'title'
  | 'title2'
  | 'headline'
  | 'body'
  | 'callout'
  | 'subhead'
  | 'footnote'
  | 'caption'
  | 'timer'
  | 'display';

export const type: Record<Variant, TextStyle> = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700', letterSpacing: 0.37 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: '600' },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  timer: { fontSize: 80, lineHeight: 88, fontWeight: '300', fontVariant: ['tabular-nums'], letterSpacing: -1.5 },
  display: { fontSize: 44, lineHeight: 50, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
};

export const TEXT_SCALE = { default: 1, large: 1.12, larger: 1.25 } as const;
