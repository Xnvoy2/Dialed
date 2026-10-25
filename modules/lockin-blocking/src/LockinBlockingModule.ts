import { NativeModule, requireOptionalNativeModule } from 'expo';

export type NativeAuthStatus = 'notDetermined' | 'denied' | 'approved' | 'unknown';
export interface SelectionSummary {
  applications: number;
  categories: number;
  webDomains: number;
}
export interface NativeShieldState {
  shielded: boolean;
  monitoring: boolean;
  endsAtMs?: number;
  extensionLastClearedAtMs?: number;
}

declare class LockinBlockingModule extends NativeModule<{}> {
  isSimulator(): boolean;
  authorizationStatus(): NativeAuthStatus;
  requestAuthorization(): Promise<{ status: NativeAuthStatus; error?: string }>;
  selectionSummary(): SelectionSummary;
  clearSelection(): void;
  presentActivityPicker(): Promise<SelectionSummary | null>;
  startShield(endsAtMs: number): Promise<{
    shielded: boolean;
    monitoring: boolean;
    error?: 'not_authorized' | 'empty_selection';
    monitoringError?: string;
  }>;
  stopShield(): Promise<{ shielded: boolean }>;
  shieldState(): NativeShieldState;
}

/** Null in Expo Go, on Android, or in any build without the native module. */
export default requireOptionalNativeModule<LockinBlockingModule>('LockinBlocking');
