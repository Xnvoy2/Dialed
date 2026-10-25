import { Stack, router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import React from 'react';
import { colors } from '../../ui/theme';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
        headerLargeTitle: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'Settings',
          headerLeft: () => (
            <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Done">
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>Done</Text>
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="blocking" options={{ title: 'App blocking' }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
    </Stack>
  );
}
