import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Switch,
  Text,
  TextProps,
  View,
  ViewStyle,
} from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useApp } from '../state/AppProvider';
import { Glass } from './Glass';
import { MIN_TOUCH, SIDE, TEXT_SCALE, TILE_GAP, Variant, colors, radius, space, type } from './theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ---------- Text ----------

export function T({
  v = 'body',
  color = colors.text,
  style,
  center,
  ...rest
}: TextProps & { v?: Variant; color?: string; center?: boolean }) {
  const { prefs } = useApp();
  const scale = TEXT_SCALE[prefs.textScale] ?? 1;
  const base = type[v];
  const scaled =
    scale === 1
      ? base
      : { ...base, fontSize: (base.fontSize ?? 17) * scale, lineHeight: base.lineHeight ? base.lineHeight * scale : undefined };
  return (
    <Text
      maxFontSizeMultiplier={v === 'timer' ? 1.3 : 2.2}
      style={[scaled, { color }, center && { textAlign: 'center' }, style]}
      {...rest}
    />
  );
}

// ---------- Layout ----------

export function SectionHeader({
  title,
  action,
  onAction,
  accessibilityHint,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  accessibilityHint?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <T v="title2" accessibilityRole="header" style={{ flex: 1, fontSize: 20, fontWeight: '700' }}>
        {title}
      </T>
      {action && onAction ? (
        <Pressable
          onPress={onAction}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityHint={accessibilityHint}
          style={({ pressed }) => [styles.sectionAction, pressed && { opacity: 0.5 }]}
        >
          <T v="subhead" style={{ fontWeight: '600' }}>
            {action}
          </T>
          <Ionicons name="chevron-forward" size={14} color={colors.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Group({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <Glass radius={radius.l} style={[{ marginHorizontal: SIDE - 4 }, style]}>
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <View style={styles.separator} /> : null}
          {child}
        </React.Fragment>
      ))}
    </Glass>
  );
}

/** Each child becomes its own rounded tile, stacked with a small gap. */
export function Tiles({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ marginHorizontal: SIDE - 4, gap: TILE_GAP }, style]}>
      {items.map((child, i) => (
        <Glass key={i} radius={radius.l}>
          {child}
        </Glass>
      ))}
    </View>
  );
}

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  if (!onPress) {
    return (
      <Glass radius={radius.l} style={[styles.card, style]}>
        {children}
      </Glass>
    );
  }
  return (
    <Glass radius={radius.l} style={[styles.card, style]} onPress={onPress} accessibilityLabel={accessibilityLabel} interactive>
      {children}
    </Glass>
  );
}

export function Row({
  icon,
  leading,
  title,
  subtitle,
  value,
  trailing,
  chevron,
  onPress,
  onLongPress,
  disabled,
  muted,
  accessibilityLabel,
  accessibilityHint,
}: {
  icon?: IconName;
  leading?: React.ReactNode;
  title: string;
  subtitle?: string | null;
  value?: string;
  trailing?: React.ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  muted?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const content = (
    <>
      {leading ?? (icon ? <IconBubble name={icon} /> : null)}
      <View style={{ flex: 1, gap: 2 }}>
        <T
          v="callout"
          color={muted ? colors.tertiary : colors.text}
          style={muted ? { textDecorationLine: 'line-through' } : undefined}
          numberOfLines={3}
        >
          {title}
        </T>
        {subtitle ? (
          <T v="footnote" color={colors.secondary} numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {value ? (
        <T v="subhead" color={colors.secondary}>
          {value}
        </T>
      ) : null}
      {trailing}
      {chevron ? <Ionicons name="chevron-forward" size={16} color={colors.tertiary} /> : null}
    </>
  );
  if (!onPress && !onLongPress) {
    return (
      <View style={styles.row} accessible accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, value].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.surfacePressed }, disabled && { opacity: 0.4 }]}
    >
      {content}
    </Pressable>
  );
}

export function IconBubble({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <View style={styles.iconBubble}>
      <Ionicons name={name} size={size} color={colors.text} />
    </View>
  );
}

// ---------- Controls ----------

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  loading,
  style,
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'plain';
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const fg = kind === 'primary' ? colors.onPrimary : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!(disabled || loading) }}
      style={({ pressed }) => [
        styles.button,
        kind === 'primary' && { backgroundColor: colors.text },
        kind === 'secondary' && { backgroundColor: colors.surfaceRaised },
        kind === 'plain' && { backgroundColor: 'transparent' },
        pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] },
        (disabled || loading) && { opacity: 0.4 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <T v="headline" color={fg}>
        {title}
      </T>
    </Pressable>
  );
}

export function IconButton({
  name,
  onPress,
  label,
  size = 40,
  filled,
  style,
}: {
  name: IconName;
  onPress: () => void;
  label: string;
  size?: number;
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={Math.max(0, (MIN_TOUCH - size) / 2)}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: filled ? colors.text : colors.surfaceRaised,
        },
        pressed && { opacity: 0.6 },
        style,
      ]}
    >
      <Ionicons name={name} size={size * 0.48} color={filled ? colors.onPrimary : colors.text} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: colors.text, borderColor: colors.text },
        pressed && { opacity: 0.7 },
      ]}
    >
      <T v="subhead" color={selected ? colors.onPrimary : colors.text} style={{ fontWeight: '600' }}>
        {label}
      </T>
    </Pressable>
  );
}

export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="radiogroup">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && { backgroundColor: colors.surfaceRaised }]}
          >
            <T v="subhead" color={active ? colors.text : colors.secondary} style={{ fontWeight: '600' }}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  format = String,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  label: string;
}) {
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, value + step));
        if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, value - step));
      }}
    >
      <IconButton name="remove" label={`Decrease ${label}`} onPress={() => onChange(Math.max(min, value - step))} />
      <T v="headline" style={{ minWidth: 72, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
        {format(value)}
      </T>
      <IconButton name="add" label={`Increase ${label}`} onPress={() => onChange(Math.min(max, value + step))} />
    </View>
  );
}

export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  disabled,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="callout">{title}</T>
        {subtitle ? (
          <T v="footnote" color={colors.secondary}>
            {subtitle}
          </T>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={title}
        trackColor={{ false: colors.surfacePressed, true: '#E5E5EA' }}
        thumbColor={value ? colors.onPrimary : '#F2F2F7'}
        ios_backgroundColor={colors.surfacePressed}
      />
    </View>
  );
}

export function CheckCircle({
  checked,
  onPress,
  label,
  size = 26,
}: {
  checked: boolean;
  onPress: () => void;
  label: string;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={{ width: MIN_TOUCH - 8, height: MIN_TOUCH - 8, alignItems: 'center', justifyContent: 'center' }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor: checked ? colors.text : colors.borderStrong,
          backgroundColor: checked ? colors.text : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked ? <Ionicons name="checkmark" size={size * 0.62} color={colors.onPrimary} /> : null}
      </View>
    </Pressable>
  );
}

// ---------- Display ----------

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function Ring({
  size,
  stroke,
  progress,
  track = colors.track,
  color = colors.text,
  animate = true,
  children,
}: {
  size: number;
  stroke: number;
  progress: number;
  track?: string;
  color?: string;
  /** Spring to new values. Turned off for the live timer, which redraws every tick. */
  animate?: boolean;
  children?: React.ReactNode;
}) {
  const { reduceMotion } = useApp();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  const sv = useSharedValue(animate && !reduceMotion ? 0 : p);
  useEffect(() => {
    sv.value = animate && !reduceMotion ? withTiming(p, { duration: 700, easing: Easing.out(Easing.cubic) }) : p;
  }, [p, animate, reduceMotion, sv]);
  const props = useAnimatedProps(() => ({
    strokeDashoffset: c * (1 - sv.value),
    strokeOpacity: sv.value > 0.001 ? 1 : 0,
  }));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          animatedProps={props}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children}
    </View>
  );
}

/** Small icon inside a progress ring, used at the start of "next up" style tiles. */
export function RingIcon({ name, progress, size = 40 }: { name: IconName; progress: number; size?: number }) {
  return (
    <Ring size={size} stroke={2.5} progress={progress}>
      <Ionicons name={name} size={size * 0.42} color={colors.secondary} />
    </Ring>
  );
}

export function ProgressBar({ progress, height = 4 }: { progress: number; height?: number }) {
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: colors.track, overflow: 'hidden' }}>
      <View style={{ width: `${p * 100}%`, height, borderRadius: height, backgroundColor: colors.text }} />
    </View>
  );
}

/** Row of capsules, one per item, filled when done (habits due today). */
export function PillMeter({ done, total, max = 10 }: { done: number; total: number; max?: number }) {
  const n = Math.min(total, max);
  if (n === 0) return null;
  const filled = Math.min(done, n);
  return (
    <View style={{ flexDirection: 'row', gap: 6 }} importantForAccessibility="no-hide-descendants">
      {Array.from({ length: n }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            maxWidth: 52,
            height: 30,
            borderRadius: 15,
            backgroundColor: i < filled ? colors.text : colors.track,
          }}
        />
      ))}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  actions,
}: {
  icon: IconName;
  title: string;
  body?: string;
  actions?: React.ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={26} color={colors.secondary} />
      <T v="headline" center>
        {title}
      </T>
      {body ? (
        <T v="subhead" color={colors.secondary} center>
          {body}
        </T>
      ) : null}
      {actions ? <View style={{ flexDirection: 'row', gap: space.s, marginTop: space.s, flexWrap: 'wrap', justifyContent: 'center' }}>{actions}</View> : null}
    </View>
  );
}

export function SmallButton({ title, onPress, icon }: { title: string; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.smallButton, pressed && { opacity: 0.6 }]}
    >
      {icon ? <Ionicons name={icon} size={15} color={colors.text} /> : null}
      <T v="subhead" style={{ fontWeight: '600' }}>
        {title}
      </T>
    </Pressable>
  );
}

export function Note({ children, icon = 'information-circle-outline' }: { children: React.ReactNode; icon?: IconName }) {
  return (
    <View style={styles.note}>
      <Ionicons name={icon} size={18} color={colors.secondary} style={{ marginTop: 1 }} />
      <T v="footnote" color={colors.secondary} style={{ flex: 1 }}>
        {children}
      </T>
    </View>
  );
}

export const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.xl,
    marginBottom: space.xs,
    paddingHorizontal: SIDE,
  },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: MIN_TOUCH },
  group: {
    marginHorizontal: SIDE - 4,
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    overflow: 'hidden',
  },
  tile: {
    backgroundColor: colors.surface,
    borderRadius: radius.l,
    overflow: 'hidden',
  },
  card: {
    marginHorizontal: SIDE - 4,
    padding: space.l,
  },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.09)', marginLeft: space.l },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    minHeight: 60,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    minHeight: 52,
    borderRadius: radius.pill,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
  },
  chip: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: space.l,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    padding: 3,
  },
  segment: { flex: 1, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  empty: {
    alignItems: 'center',
    gap: space.s,
    paddingVertical: space.xxl,
    paddingHorizontal: space.xl,
  },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: space.l,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
  },
  note: {
    flexDirection: 'row',
    gap: space.s,
    paddingHorizontal: SIDE,
    paddingVertical: space.s,
  },
});

/** Soft fade so content scrolling under a pinned footer doesn't end in a hard edge. */
export function FadeEdge({ height = 32 }: { height?: number }) {
  return (
    <Svg width="100%" height={height} style={{ position: 'absolute', top: -height, left: 0, right: 0 }} pointerEvents="none">
      <Defs>
        <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.bg} stopOpacity="0" />
          <Stop offset="1" stopColor={colors.bg} stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height={height} fill="url(#fade)" />
    </Svg>
  );
}

/** Title on the left, − value + on the right. Fits inside a tile like other rows. */
export function StepperRow({
  title,
  icon,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = String,
}: {
  title: string;
  icon?: IconName;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={title}
      accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'increment') onChange(Math.min(max, value + step));
        if (e.nativeEvent.actionName === 'decrement') onChange(Math.max(min, value - step));
      }}
    >
      {icon ? <IconBubble name={icon} /> : null}
      <T v="callout" style={{ flex: 1 }}>
        {title}
      </T>
      <IconButton name="remove" label={`Decrease ${title}`} size={34} onPress={() => onChange(Math.max(min, value - step))} />
      <T v="headline" style={{ minWidth: 62, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
        {format(value)}
      </T>
      <IconButton name="add" label={`Increase ${title}`} size={34} onPress={() => onChange(Math.min(max, value + step))} />
    </View>
  );
}

/** A labelled segmented control laid out as a tile row. */
export function SegmentRow<V extends string | number>({
  title,
  icon,
  subtitle,
  options,
  value,
  onChange,
}: {
  title: string;
  icon?: IconName;
  subtitle?: string;
  options: { value: V; label: string }[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <View style={{ padding: space.l, gap: space.m }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
        {icon ? <IconBubble name={icon} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <T v="callout">{title}</T>
          {subtitle ? (
            <T v="footnote" color={colors.secondary}>
              {subtitle}
            </T>
          ) : null}
        </View>
      </View>
      <Segmented options={options} value={value} onChange={onChange} />
    </View>
  );
}
