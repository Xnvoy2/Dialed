import {
  Geist_300Light,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  Geist_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/geist';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import React from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '../state/AppProvider';
import { colors } from '../ui/theme';

SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});

const sheet = {
  presentation: 'formSheet' as const,
  sheetGrabberVisible: true,
  sheetCornerRadius: 24,
  contentStyle: { backgroundColor: colors.surface },
};

export default function RootLayout() {
  const [fontsReady, fontError] = useFonts({
    Geist_300Light,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    Geist_800ExtraBold,
  });
  // Bundled fonts load in a few ms; on error fall back to the system font.
  if (!fontsReady && !fontError) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaProvider>
        <AppProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              headerStyle: { backgroundColor: colors.bg },
              headerTintColor: colors.text,
              headerShadowVisible: false,
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="focus" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
            <Stack.Screen name="level" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="task/[id]" options={{ ...sheet, sheetAllowedDetents: [0.62, 1] }} />
            <Stack.Screen name="habit/edit/[id]" options={{ ...sheet, sheetAllowedDetents: [0.75, 1] }} />
            <Stack.Screen name="session/[id]" options={{ ...sheet, sheetAllowedDetents: [0.6, 1] }} />
            <Stack.Screen
              name="habit/[id]"
              options={{ headerShown: true, title: '', headerBackTitle: 'Habits', headerTransparent: false }}
            />
          </Stack>
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
