import Native from '../../../modules/lockin-blocking/src/LockinBlockingModule';
import { BlockingAvailability, BlockingProvider, selectionCount } from './types';

const MISSING =
  'Needs the iOS development build. Expo Go cannot include Screen Time code.';

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
  async startShield(endsAtMs) {
    const a = availability();
    if (a.state !== 'approved') return { applied: false, autoExpiry: false, reason: a.state };
    if (selectionCount(a.selection) === 0) return { applied: false, autoExpiry: false, reason: 'empty_selection' };
    const r = await Native!.startShield(endsAtMs);
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
  diagnostics() {
    if (!Native) return null;
    return { isSimulator: Native.isSimulator(), ...Native.shieldState() };
  },
};
