import DeviceActivity
import Foundation
import ManagedSettings

/// Runs in its own process, scheduled by the system. When the focus session's
/// interval ends it lifts the shield, so apps unlock on time even if the main
/// app was force-quit. It only touches our named store.
class DeviceActivityMonitorExtension: DeviceActivityMonitor {
  private let store = ManagedSettingsStore(named: ManagedSettingsStore.Name("lockin.focus"))
  private let activity = DeviceActivityName("lockin.session")

  /// group.<app bundle id>, derived from this extension's id (<app bundle id>.monitor).
  private var defaults: UserDefaults? {
    guard let id = Bundle.main.bundleIdentifier else { return nil }
    let app = id.split(separator: ".").dropLast().joined(separator: ".")
    return UserDefaults(suiteName: "group.\(app)")
  }

  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    guard activity == self.activity else { return }
    store.clearAllSettings()
    defaults?.set(Date().timeIntervalSince1970 * 1000, forKey: "lockin.extension.lastIntervalEnd")
    defaults?.removeObject(forKey: "lockin.shield.endsAt")
  }
}
