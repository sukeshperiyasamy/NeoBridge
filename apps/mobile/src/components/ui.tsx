import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { BandStatus } from '@neobridge/ble-protocol';
import type { Status } from '@neobridge/domain';
import { bi, t, type Bilingual, type Key } from '@neobridge/i18n';
import { color, radius, size, status as statusColor } from '@neobridge/tokens';

import { StatusShape } from '@/components/status-shape';
import { fontFamily } from '@/constants/fonts';
import { Icon, type IconName } from '@/components/icon';
import { useLanguage } from '@/language';

/**
 * Small building blocks shared by the mother, ASHA and doctor screens, so every
 * list and form has the same type, spacing, and empty / loading / error states.
 */

export const statusToBand: Record<Status, BandStatus> = {
  green: BandStatus.Green,
  yellow: BandStatus.Yellow,
  red: BandStatus.Red,
  grey: BandStatus.Grey,
};

export const statusLabelKey: Record<Status, Key> = {
  green: 'status.label.green',
  yellow: 'status.label.yellow',
  red: 'status.label.red',
  grey: 'status.label.grey',
};

export const rowTint: Record<Status, string> = {
  red: statusColor.red.soft,
  yellow: statusColor.yellow.panel,
  grey: statusColor.grey.panel,
  green: color.surface,
};

export function useT() {
  const [lang] = useLanguage();
  return {
    lang,
    t: (key: Key, vars?: Parameters<typeof t>[2]) => t(lang, key, vars),
    bi: (key: Key, vars?: Parameters<typeof bi>[2]) => bi(lang, key, vars),
  };
}

/** A screen with a scroll body. `back` adds a back button (stack screens). */
export function Screen({
  children,
  header,
  back,
  scroll = true,
  edges = ['top'],
  style,
}: {
  children: ReactNode;
  header?: ReactNode;
  back?: boolean;
  scroll?: boolean;
  edges?: ('top' | 'bottom')[];
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useT();
  return (
    <SafeAreaView style={[s.screen, style]} edges={edges}>
      {back && (
        <Pressable
          accessibilityRole="button"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          style={s.back}>
          <Text style={s.backText}>‹ {t('common.back')}</Text>
        </Pressable>
      )}
      {header}
      {scroll ? (
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[s.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style, tint }: { children: ReactNode; style?: StyleProp<ViewStyle>; tint?: string }) {
  return <View style={[s.card, tint ? { backgroundColor: tint } : null, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={s.h1}>{children}</Text>;
}

export function H2({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.h2, style]}>{children}</Text>;
}

export function Body({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.body, style]}>{children}</Text>;
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.muted, style]}>{children}</Text>;
}

export function Strong({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[s.strong, style]}>{children}</Text>;
}

/** A Hindi line with its English gloss underneath (gloss hidden in English or when turned off). */
export function Line({ value, style, glossStyle }: { value: Bilingual; style?: StyleProp<TextStyle>; glossStyle?: StyleProp<TextStyle> }) {
  return (
    <View>
      <Text style={[s.body, style]}>{value.text}</Text>
      {value.gloss && <Text style={[s.gloss, glossStyle]}>{value.gloss}</Text>}
    </View>
  );
}

/** A confirmation line: green tick icon and text. */
export function Success({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return (
    <View style={s.iconLine}>
      <Icon name="checkCircle" size={20} color={statusColor.green.fill} />
      <Text style={[s.strong, { flex: 1 }, style]}>{children}</Text>
    </View>
  );
}

/** Text with a leading icon. */
export function IconLine({
  icon,
  children,
  color: tone = color.text,
  style,
  size = 18,
}: {
  icon: IconName;
  children: ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
  size?: number;
}) {
  return (
    <View style={s.iconLine}>
      <Icon name={icon} size={size} color={tone} />
      <Text style={[s.strong, { flex: 1, color: tone }, style]}>{children}</Text>
    </View>
  );
}

export function Row({ children, style, gap = 10 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  disabled,
  busy,
  kind = 'primary',
  style,
  icon,
}: {
  label: string | Bilingual;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  kind?: 'primary' | 'secondary' | 'danger' | 'dangerSolid';
  style?: StyleProp<ViewStyle>;
  /** shown before the label */
  icon?: IconName;
}) {
  const b = typeof label === 'string' ? { text: label, gloss: null } : label;
  const solid = kind === 'primary' || kind === 'dangerSolid';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        solid ? s.primary : s.secondary,
        kind === 'danger' && { borderColor: statusColor.red.fill },
        kind === 'dangerSolid' && { backgroundColor: statusColor.red.text },
        (pressed || disabled) && { opacity: 0.65 },
        style,
      ]}>
      {busy ? (
        <ActivityIndicator color={solid ? color.surface : color.action} />
      ) : (
        <>
          <View style={s.buttonRow}>
            {icon && (
              <Icon
                name={icon}
                size={solid ? 22 : 18}
                color={solid ? color.surface : kind === 'danger' ? statusColor.red.text : color.action}
              />
            )}
            <Text
              style={[
                solid ? s.primaryText : s.secondaryText,
                kind === 'danger' && { color: statusColor.red.text },
              ]}>
              {b.text}
            </Text>
          </View>
          {b.gloss && <Text style={solid ? s.primaryGloss : s.gloss}>{b.gloss}</Text>}
        </>
      )}
    </Pressable>
  );
}

/** Pick one of a few options (chips). */
export function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      {label && <Text style={s.label}>{label}</Text>}
      <View style={s.chips}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(o.value)}
              style={[s.chip, on && s.chipOn]}>
              <Text style={[s.chipText, on && { color: color.surface }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function YesNo({ label, value, onChange }: { label: string | Bilingual; value: boolean | null; onChange: (v: boolean) => void }) {
  const { t } = useT();
  const l = typeof label === 'string' ? { text: label, gloss: null } : label;
  return (
    <View style={s.yesNo}>
      <View style={{ flex: 1 }}>
        <Text style={s.strong}>{l.text}</Text>
        {l.gloss && <Text style={s.gloss}>{l.gloss}</Text>}
      </View>
      <Choice
        options={[
          { value: 'yes', label: t('common.yes') },
          { value: 'no', label: t('common.no') },
        ]}
        value={value === null ? null : value ? 'yes' : 'no'}
        onChange={(v) => onChange(v === 'yes')}
      />
    </View>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  error,
  hint,
  keyboardType,
  multiline,
  placeholder,
  maxLength,
  autoFocus,
  secure,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string | null;
  hint?: string;
  keyboardType?: 'default' | 'phone-pad' | 'number-pad' | 'decimal-pad';
  multiline?: boolean;
  placeholder?: string;
  maxLength?: number;
  autoFocus?: boolean;
  secure?: boolean;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={color.textMuted}
        maxLength={maxLength}
        autoFocus={autoFocus}
        secureTextEntry={secure}
        autoCapitalize={secure || keyboardType ? 'none' : undefined}
        autoCorrect={secure ? false : undefined}
        style={[s.input, multiline && { minHeight: 90, textAlignVertical: 'top' }, error ? { borderColor: statusColor.red.fill } : null]}
      />
      {error ? <Text style={s.error}>{error}</Text> : hint ? <Text style={s.muted}>{hint}</Text> : null}
    </View>
  );
}

export function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text style={[s.body, { flex: 1 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: color.action }} />
    </Row>
  );
}

export function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={s.check}>
      <View style={[s.box, value && s.boxOn]}>{value && <Icon name="check" size={18} color={color.surface} />}</View>
      <Text style={[s.body, { flex: 1 }]}>{label}</Text>
    </Pressable>
  );
}

/** Status chip: shape + word, never colour alone. Families see the word, never numbers. */
export function StatusChip({ status, small }: { status: Status; small?: boolean }) {
  const { t } = useT();
  return (
    <View style={[s.statusChip, { backgroundColor: rowTint[status] }]}>
      <StatusShape status={statusToBand[status]} size={small ? 12 : 16} />
      <Text style={[s.statusText, small && { fontSize: 12 }]}>{t(statusLabelKey[status])}</Text>
    </View>
  );
}

export function Loading() {
  const { t } = useT();
  return (
    <View style={s.state}>
      <ActivityIndicator color={color.action} />
      <Text style={s.muted}>{t('common.loading')}</Text>
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { bi, t } = useT();
  return (
    <Card>
      <Line value={bi('common.error')} />
      <Button kind="secondary" label={t('common.retry')} onPress={onRetry} />
    </Card>
  );
}

export function Empty({ text }: { text?: string }) {
  const { t } = useT();
  return (
    <View style={s.state}>
      <Text style={s.muted}>{text ?? t('common.empty')}</Text>
    </View>
  );
}

/** Loading / error / empty for a query, then the content. */
export function QueryView<T>({
  q,
  children,
  empty,
}: {
  q: { data: T | null; loading: boolean; error: unknown; refresh: () => void };
  children: (data: T) => ReactNode;
  empty?: (data: T) => boolean;
}) {
  if (q.data === null) return q.loading ? <Loading /> : <ErrorState onRetry={q.refresh} />;
  if (empty?.(q.data)) return <Empty />;
  return <>{children(q.data)}</>;
}

export const ui = StyleSheet.create({
  gap: { gap: 12 },
});

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.background, paddingHorizontal: size.screenGutter },
  content: { gap: 12, paddingBottom: 32, paddingTop: 4 },
  back: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingRight: 16 },
  backText: { fontFamily: fontFamily.bodyBold, fontSize: 16, color: color.action },
  card: { backgroundColor: color.surface, borderRadius: radius.card, padding: 16, gap: 10 },
  h1: { fontFamily: fontFamily.heading, fontSize: 28, lineHeight: 38, color: color.text },
  h2: { fontFamily: fontFamily.heading, fontSize: 20, lineHeight: 28, color: color.text },
  body: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 22, color: color.text },
  strong: { fontFamily: fontFamily.bodyBold, fontSize: 16, lineHeight: 22, color: color.text },
  muted: { fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18, color: color.textMuted },
  gloss: { fontFamily: fontFamily.body, fontSize: 12, color: color.textMuted },
  label: { fontFamily: fontFamily.bodySemiBold, fontSize: 14, color: color.textSecondary },
  error: { fontFamily: fontFamily.bodySemiBold, fontSize: 13, color: statusColor.red.text },
  input: {
    minHeight: size.touchMin + 4,
    borderWidth: 2,
    borderColor: color.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontFamily: fontFamily.body,
    fontSize: 17,
    color: color.text,
    backgroundColor: color.surface,
  },
  primary: {
    minHeight: 56,
    paddingVertical: 8,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.button,
    backgroundColor: color.action,
  },
  primaryText: { fontFamily: fontFamily.heading, fontSize: 19, lineHeight: 26, color: color.surface, textAlign: 'center' },
  primaryGloss: { fontFamily: fontFamily.body, fontSize: 12, color: color.actionOnDark },
  secondary: {
    minHeight: size.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: color.action,
    backgroundColor: color.surface,
  },
  secondaryText: { fontFamily: fontFamily.bodyBold, fontSize: 15, color: color.action, textAlign: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: size.touchMin,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: radius.chip,
    borderWidth: 2,
    borderColor: color.action,
    backgroundColor: color.surface,
  },
  chipOn: { backgroundColor: color.action },
  chipText: { fontFamily: fontFamily.bodySemiBold, fontSize: 15, color: color.action },
  yesNo: { gap: 6, paddingVertical: 4 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: size.touchMin },
  box: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: color.action,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: color.action },
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  iconLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tick: { color: color.surface, fontFamily: fontFamily.bodyBold, fontSize: 18, lineHeight: 22 },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: color.border,
  },
  statusText: { fontFamily: fontFamily.bodySemiBold, fontSize: 13, color: color.text },
  state: { alignItems: 'center', gap: 8, paddingVertical: 32 },
});
