import { router } from 'expo-router';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { IconButton, T } from './components';
import { space } from './theme';

/**
 * Title row at the top of a scrolling page, used instead of the system header
 * so there's no bar across the top. "done" closes the sheet; "back" goes back.
 */
export function SheetHeader({ title, action }: { title: string; action: 'done' | 'back' }) {
  return (
    <View style={styles.row}>
      <IconButton
        name={action === 'done' ? 'close' : 'chevron-back'}
        label={action === 'done' ? 'Done' : 'Back'}
        size={36}
        onPress={() => router.back()}
      />
      <T v="headline" accessibilityRole="header" style={styles.title} numberOfLines={1}>
        {title}
      </T>
      <View style={{ width: 36 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingTop: space.m, paddingBottom: space.s },
  title: { flex: 1, textAlign: 'center' },
});
