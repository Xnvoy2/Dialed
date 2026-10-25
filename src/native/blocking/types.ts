export interface SelectionSummary {
  applications: number;
  categories: number;
  webDomains: number;
}

export type BlockingAvailability =
  /** No native implementation in this build or on this platform. */
  | { state: 'unsupported'; reason: string }
  | { state: 'not_determined' }
  | { state: 'denied' }
  | { state: 'approved'; selection: SelectionSummary };

/** Only `applied: true` may ever be presented to the user as "apps blocked". */
export interface ShieldResult {
  applied: boolean;
  /** The system will lift the shield at the end time even if the app is killed. */
  autoExpiry: boolean;
  reason?: string;
}

export interface ShieldActivity {
  backToFocus: number;
  deliberateExits: number;
  /** Set while one app is exempt after "Open for 5 minutes". */
  graceUntilMs?: number;
}

export interface ShieldDiagnostics {
  isSimulator: boolean;
  shielded: boolean;
  monitoring: boolean;
  endsAtMs?: number;
  extensionLastClearedAtMs?: number;
}

/**
 * Platform-specific blocking. iOS: FamilyControls + ManagedSettings +
 * DeviceActivity (index.ios.ts). Android: not implemented (index.android.ts).
 */
export interface BlockingProvider {
  availability(): BlockingAvailability;
  /** `declined` is true when the user dismissed or refused the system prompt. */
  requestAuthorization(): Promise<{ availability: BlockingAvailability; declined: boolean; error?: string }>;
  chooseApps(): Promise<SelectionSummary | null>;
  /** `resetCounts` is true for a new lock-in, false when re-applying (resume, recovery). */
  startShield(endsAtMs: number, opts: { reason: string | null; resetCounts: boolean }): Promise<ShieldResult>;
  activity(): ShieldActivity | null;
  /** Always-on adult-website filter. `on` is read back from Screen Time. */
  setAdultFilter(on: boolean): Promise<{ on: boolean; reason?: string }>;
  adultFilterOn(): boolean;
  stopShield(): Promise<void>;
  diagnostics(): ShieldDiagnostics | null;
}

export function selectionCount(s: SelectionSummary): number {
  return s.applications + s.categories + s.webDomains;
}

export function describeSelection(s: SelectionSummary): string {
  const parts: string[] = [];
  if (s.applications) parts.push(`${s.applications} app${s.applications === 1 ? '' : 's'}`);
  if (s.categories) parts.push(`${s.categories} categor${s.categories === 1 ? 'y' : 'ies'}`);
  if (s.webDomains) parts.push(`${s.webDomains} site${s.webDomains === 1 ? '' : 's'}`);
  return parts.length ? parts.join(', ') : 'Nothing selected';
}
