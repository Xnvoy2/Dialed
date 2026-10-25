import { BlockingProvider } from './types';

// Android blocking is NOT implemented. A future version would likely use an
// AccessibilityService or UsageStats-based approach behind this same interface.
const reason = 'App blocking isn’t available on Android yet.';

export const blocking: BlockingProvider = {
  availability: () => ({ state: 'unsupported', reason }),
  requestAuthorization: async () => ({ availability: { state: 'unsupported', reason }, declined: false }),
  chooseApps: async () => null,
  startShield: async () => ({ applied: false, autoExpiry: false, reason }),
  stopShield: async () => {},
  diagnostics: () => null,
};
