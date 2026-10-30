import { TextStyle } from 'react-native';

/** Night navy, electric blue and white, from the Dialed brand. */
export const colors = {
  bg: '#0A081E',
  surface: '#141433',
  surfaceRaised: '#1C1D45',
  surfacePressed: '#24265A',
  border: '#1F2150',
  borderStrong: '#343873',
  track: '#222452',
  text: '#FFFFFF',
  secondary: '#A7ABD0',
  tertiary: '#6C7099',
  /** Electric blue: progress, selection and primary actions. */
  accent: '#3D7BFF',
  onPrimary: '#FFFFFF',
  dock: 'rgba(20,20,51,0.88)',
  dockActive: 'rgba(61,123,255,0.18)',
} as const;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const radius = { s: 10, m: 14, l: 26, pill: 999 } as const;
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
  | 'display'
  | 'hero';

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
  hero: { fontSize: 36, lineHeight: 39, fontWeight: '700', letterSpacing: -1.1 },
  display: { fontSize: 44, lineHeight: 50, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
};

/** Geist (SIL Open Font License). Custom fonts pick a file per weight, so map weight to family. */
const GEIST: Record<string, string> = {
  '300': 'Geist_300Light',
  '400': 'Geist_400Regular',
  '500': 'Geist_500Medium',
  '600': 'Geist_600SemiBold',
  '700': 'Geist_700Bold',
  '800': 'Geist_800ExtraBold',
};
export function font(weight: TextStyle['fontWeight'] = '400'): string {
  const w = weight === 'bold' ? '700' : weight === 'normal' ? '400' : String(weight);
  return GEIST[w] ?? GEIST['400'];
}

export const TEXT_SCALE = { default: 1, large: 1.12, larger: 1.25 } as const;
