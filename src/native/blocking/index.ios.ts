import Constants from 'expo-constants';
import NativeModule from '../../../modules/lockin-blocking/src/LockinBlockingModule';
import { BlockingAvailability, BlockingProvider, selectionCount } from './types';

/** Builds made with DIALED_BLOCKING=0 (before Apple approves Family Controls) have no blocking. */
const builtWithout = Constants.expoConfig?.extra?.blocking === false;
const Native = builtWithout ? null : NativeModule;
const MISSING = builtWithout
  ? 'App blocking is coming in an update.'
  : 'Needs the iOS development build. Expo Go cannot include Screen Time code.';

function availability(): BlockingAvailability {
  if (!Native) return { state: 'unsupported', reason: MISSING };
  try {
    const status = Native.authorizationStatus();
    if (status === 'approved') return { state: 'approved', selection: Native.selectionSummary() };
    if (status === 'denied') return { state: 'denied' };
    if (status === 'notDetermined') return { state: 'not_determined' };
    return { state: 'unsupported', reason: 'Screen Time returned an unknown status.' };
  } catch (e) {
    return { state: 'unsupported', reason: String(e) };
  }
}

export const blocking: BlockingProvider = {
  availability,
  async requestAuthorization() {
    if (!Native) return { availability: availability(), declined: false };
    const r = await Native.requestAuthorization();
    const a = availability();
    // iOS can leave the status at notDetermined after the user taps Don't Allow.
    return { availability: a, declined: a.state !== 'approved', error: r.error };
  },
  async chooseApps() {
    if (!Native) return null;
    return Native.presentActivityPicker();
  },
  async startShield(endsAtMs, opts) {
    const a = availability();
    if (a.state !== 'approved') return { applied: false, autoExpiry: false, reason: a.state };
    if (selectionCount(a.selection) === 0) return { applied: false, autoExpiry: false, reason: 'empty_selection' };
    const r = await Native!.startShield(endsAtMs, opts.reason, opts.resetCounts);
    return {
      applied: r.shielded,
      autoExpiry: r.monitoring,
      reason: r.error ?? r.monitoringError,
    };
  },
  async stopShield() {
    if (!Native) return;
    await Native.stopShield();
  },
  async setAdultFilter(on) {
    if (!Native) return { on: false, reason: 'unsupported' };
    const r = await Native.setAdultFilter(on);
    return { on: r.on, reason: r.error };
  },
  adultFilterOn() {
    try {
      return Native?.adultFilterOn() ?? false;
    } catch {
      return false;
    }
  },
  activity() {
    if (!Native) return null;
    try {
      return Native.shieldActivity();
    } catch {
      return null;
    }
  },
  diagnostics() {
    if (!Native) return null;
    return { isSimulator: Native.isSimulator(), ...Native.shieldState() };
  },
};
