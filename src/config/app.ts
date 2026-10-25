import Constants from 'expo-constants';

/** Working display name. Configure with APP_DISPLAY_NAME at build time (see app.config.ts). */
export const APP_NAME: string = (Constants.expoConfig?.extra?.displayName as string | undefined) ?? 'Dialed';
export const APP_VERSION: string = Constants.expoConfig?.version ?? '0.0.0';
/** Simulated rewards may only ever exist in development builds. */
export const DEMO_REWARDS_ALLOWED: boolean = __DEV__;
