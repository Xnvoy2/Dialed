import DeviceActivity
import FamilyControls
import Foundation
import ManagedSettings

/// Runs in its own process, scheduled by the system, so it works while the
/// main app is closed.
/// - "lockin.session" ending: lift every shield on time.
/// - "lockin.grace" ending: the 5-minute exemption is over; re-block the
///   chosen apps if the lock-in is still running.
class DeviceActivityMonitorExtension: DeviceActivityMonitor {
  private let store = ManagedSettingsStore(named: ManagedSettingsStore.Name("lockin.focus"))
  private let session = DeviceActivityName("lockin.session")
  private let grace = DeviceActivityName("lockin.grace")

  /// group.<app bundle id>, derived from this extension's id (<app bundle id>.monitor).
  private var defaults: UserDefaults? {
    guard let id = Bundle.main.bundleIdentifier else { return nil }
    let app = id.split(separator: ".").dropLast().joined(separator: ".")
    return UserDefaults(suiteName: "group.\(app)")
  }

  override func intervalDidEnd(for activity: DeviceActivityName) {
    super.intervalDidEnd(for: activity)
    if activity == session {
      store.clearAllSettings()
      defaults?.set(Date().timeIntervalSince1970 * 1000, forKey: "lockin.extension.lastIntervalEnd")
      defaults?.removeObject(forKey: "lockin.shield.endsAt")
      defaults?.removeObject(forKey: "lockin.grace.until")
    } else if activity == grace {
      defaults?.removeObject(forKey: "lockin.grace.until")
      reapplyIfStillLockedIn()
    }
  }

  private func reapplyIfStillLockedIn() {
    guard
      let endsAt = defaults?.object(forKey: "lockin.shield.endsAt") as? Double,
      endsAt > Date().timeIntervalSince1970 * 1000,
      let data = defaults?.data(forKey: "lockin.selection.v1"),
      let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
    else { return }
    store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
    store.shield.applicationCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
    store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
  }
}
