// Fallback for web and type-checking. Metro picks index.ios.ts / index.android.ts on device.
import { BlockingProvider } from './types';

const reason = 'App blocking isn’t available on this platform.';

export const blocking: BlockingProvider = {
  availability: () => ({ state: 'unsupported', reason }),
  requestAuthorization: async () => ({ availability: { state: 'unsupported', reason }, declined: false }),
  chooseApps: async () => null,
  startShield: async () => ({ applied: false, autoExpiry: false, reason }),
  stopShield: async () => {},
  activity: () => null,
  setAdultFilter: async () => ({ on: false, reason }),
  adultFilterOn: () => false,
  diagnostics: () => null,
};
