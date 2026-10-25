import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * "Dialed" is a working name. Change the display name, bundle ID or team
 * without touching code:
 *   APP_DISPLAY_NAME="Something" LOCKIN_BUNDLE_ID=com.you.app APPLE_TEAM_ID=XXXXXXXXXX npx expo prebuild --clean
 */
const displayName = process.env.APP_DISPLAY_NAME ?? 'Dialed';
const bundleId = process.env.LOCKIN_BUNDLE_ID ?? 'com.joshbarton.dialed';
// Team from the sibling calorieearn project; override for another account.
const appleTeamId = process.env.APPLE_TEAM_ID ?? 'PPNNNASZJX';
const appGroup = `group.${bundleId}`;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: displayName,
  slug: 'lockin',
  scheme: 'lockin',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#161617',
  ios: {
    bundleIdentifier: bundleId,
    appleTeamId,
    supportsTablet: false,
    buildNumber: '1',
    usesAppleSignIn: true,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      CFBundleDisplayName: displayName,
      LockinAppGroup: appGroup,
    },
    entitlements: {
      // Development signing works without Apple's approval. TestFlight/App Store
      // need the distribution entitlement approved for the app AND each extension.
      'com.apple.developer.family-controls': true,
      'com.apple.security.application-groups': [appGroup],
    },
  },
  android: {
    package: bundleId.replace(/-/g, '_'),
    adaptiveIcon: {
      backgroundColor: '#161617',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    'expo-router',
    'expo-sqlite',
    'expo-sharing',
    'expo-localization',
    ['expo-splash-screen', { backgroundColor: '#161617', image: './assets/splash-icon.png', imageWidth: 120 }],
    ['expo-notifications', { enableBackgroundRemoteNotifications: false }],
    ['expo-build-properties', { ios: { deploymentTarget: '17.6' } }],
    'expo-apple-authentication',
    '@bacons/apple-targets',
  ],
  experiments: { typedRoutes: false },
  extra: {
    /** Require Sign in with Apple before the arc questions. Flip to false if App Review objects (guideline 5.1.1(v)). */
    requireSignIn: true,
    displayName,
    appGroup,
  },
});
