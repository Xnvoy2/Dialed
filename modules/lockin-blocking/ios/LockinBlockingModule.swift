import DeviceActivity
import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI

/// Screen Time blocking spike.
///
/// What this does: requests individual Screen Time authorisation, presents
/// Apple's privacy-preserving picker, shields the chosen apps/categories/sites
/// with a named ManagedSettingsStore, and starts a DeviceActivity schedule that
/// ends at the session's end time so the monitor extension can lift the shield
/// even if this app has been terminated.
///
/// What it does not do: it never sees app names or usage. The selection is an
/// opaque set of tokens stored only in this device's App Group container.
public class LockinBlockingModule: Module {
  static let storeName = ManagedSettingsStore.Name("lockin.focus")
  /// Settings that stay on outside lock-ins (the adult-website filter).
  /// Separate store so ending a lock-in never clears them.
  static let alwaysStoreName = ManagedSettingsStore.Name("lockin.always")
  static let activityName = DeviceActivityName("lockin.session")
  static let graceActivity = DeviceActivityName("lockin.grace")
  static let selectionKey = "lockin.selection.v1"
  // Shared with the extensions through the App Group. Keep names in sync.
  static let reasonKey = "lockin.shield.reason"
  static let endsAtKey = "lockin.shield.endsAt"
  static let backToFocusKey = "lockin.count.backToFocus"
  static let exitsKey = "lockin.count.exits"
  static let graceUntilKey = "lockin.grace.until"

  private var appGroup: String? {
    Bundle.main.object(forInfoDictionaryKey: "LockinAppGroup") as? String
  }

  private var defaults: UserDefaults? {
    appGroup.flatMap { UserDefaults(suiteName: $0) }
  }

  private var store: ManagedSettingsStore { ManagedSettingsStore(named: Self.storeName) }

  public func definition() -> ModuleDefinition {
    Name("LockinBlocking")

    Function("isSimulator") { () -> Bool in
      #if targetEnvironment(simulator)
        return true
      #else
        return false
      #endif
    }

    Function("authorizationStatus") { () -> String in
      Self.describe(AuthorizationCenter.shared.authorizationStatus)
    }

    AsyncFunction("requestAuthorization") { () async -> [String: Any] in
      do {
        try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
        return ["status": Self.describe(AuthorizationCenter.shared.authorizationStatus)]
      } catch {
        return [
          "status": Self.describe(AuthorizationCenter.shared.authorizationStatus),
          "error": String(describing: error),
        ]
      }
    }

    Function("selectionSummary") { () -> [String: Int] in
      Self.summary(self.loadSelection())
    }

    Function("clearSelection") {
      self.defaults?.removeObject(forKey: Self.selectionKey)
    }

    AsyncFunction("presentActivityPicker") { (promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("E_NO_VIEW", "No view controller to present the picker from.")
        return
      }
      var hosting: UIViewController?
      let sheet = PickerSheet(selection: self.loadSelection() ?? FamilyActivitySelection()) { result in
        hosting?.dismiss(animated: true)
        guard let result else {
          promise.resolve(nil)
          return
        }
        self.saveSelection(result)
        promise.resolve(Self.summary(result))
      }
      let controller = UIHostingController(rootView: sheet)
      controller.overrideUserInterfaceStyle = .dark
      controller.isModalInPresentation = true
      hosting = controller
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)

    /// Applies the shield and schedules its automatic removal at endsAtMs.
    /// Returns what was verified, never what was merely attempted.
    AsyncFunction("startShield") { (endsAtMs: Double, reason: String?, resetCounts: Bool) -> [String: Any] in
      guard Self.describe(AuthorizationCenter.shared.authorizationStatus) == "approved" else {
        return ["shielded": false, "monitoring": false, "error": "not_authorized"]
      }
      guard let selection = self.loadSelection(), Self.count(selection) > 0 else {
        return ["shielded": false, "monitoring": false, "error": "empty_selection"]
      }
      let s = self.store
      s.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
      s.shield.applicationCategories = selection.categoryTokens.isEmpty
        ? nil : .specific(selection.categoryTokens)
      s.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens

      var result: [String: Any] = ["shielded": self.isShielded()]
      do {
        try self.scheduleExpiry(endsAt: Date(timeIntervalSince1970: endsAtMs / 1000))
        result["monitoring"] = true
      } catch {
        result["monitoring"] = false
        result["monitoringError"] = String(describing: error)
      }
      let d = self.defaults
      d?.set(endsAtMs, forKey: Self.endsAtKey)
      if let reason, !reason.isEmpty { d?.set(reason, forKey: Self.reasonKey) } else { d?.removeObject(forKey: Self.reasonKey) }
      if resetCounts {
        d?.set(0, forKey: Self.backToFocusKey)
        d?.set(0, forKey: Self.exitsKey)
      }
      // A full re-apply ends any 5-minute exemption.
      d?.removeObject(forKey: Self.graceUntilKey)
      DeviceActivityCenter().stopMonitoring([Self.graceActivity])
      return result
    }

    /// Always-on adult-website filter (Safari and other WebKit browsers).
    /// Returns what was read back, not what was attempted.
    AsyncFunction("setAdultFilter") { (on: Bool) -> [String: Any] in
      let always = ManagedSettingsStore(named: Self.alwaysStoreName)
      if on {
        guard Self.describe(AuthorizationCenter.shared.authorizationStatus) == "approved" else {
          return ["on": false, "error": "not_authorized"]
        }
        always.webContent.blockedByFilter = .auto()
      } else {
        always.webContent.blockedByFilter = nil
      }
      return ["on": always.webContent.blockedByFilter != nil]
    }

    Function("adultFilterOn") { () -> Bool in
      ManagedSettingsStore(named: Self.alwaysStoreName).webContent.blockedByFilter != nil
    }

    /// Counts written by the shield-action extension for the current lock-in.
    Function("shieldActivity") { () -> [String: Any] in
      var out: [String: Any] = [
        "backToFocus": self.defaults?.integer(forKey: Self.backToFocusKey) ?? 0,
        "deliberateExits": self.defaults?.integer(forKey: Self.exitsKey) ?? 0,
      ]
      if let until = self.defaults?.object(forKey: Self.graceUntilKey) as? Double { out["graceUntilMs"] = until }
      return out
    }

    AsyncFunction("stopShield") { () -> [String: Any] in
      self.store.clearAllSettings()
      DeviceActivityCenter().stopMonitoring([Self.activityName, Self.graceActivity])
      self.defaults?.removeObject(forKey: Self.endsAtKey)
      self.defaults?.removeObject(forKey: Self.reasonKey)
      self.defaults?.removeObject(forKey: Self.graceUntilKey)
      return ["shielded": self.isShielded()]
    }

    Function("shieldState") { () -> [String: Any] in
      var state: [String: Any] = [
        "shielded": self.isShielded(),
        "monitoring": DeviceActivityCenter().activities.contains(Self.activityName),
      ]
      if let endsAt = self.defaults?.object(forKey: Self.endsAtKey) as? Double {
        state["endsAtMs"] = endsAt
      }
      if let cleared = self.defaults?.object(forKey: "lockin.extension.lastIntervalEnd") as? Double {
        state["extensionLastClearedAtMs"] = cleared
      }
      return state
    }
  }

  // MARK: - Helpers

  private func isShielded() -> Bool {
    let shield = store.shield
    return shield.applications != nil || shield.applicationCategories != nil || shield.webDomains != nil
  }

  /// DeviceActivity intervals must be at least 15 minutes. For shorter
  /// sessions the interval starts in the past so it still ends exactly when
  /// the session does. (Untested on device; see docs/BLOCKING_SPIKE.md.)
  private func scheduleExpiry(endsAt: Date) throws {
    let center = DeviceActivityCenter()
    center.stopMonitoring([Self.activityName])
    let minimum: TimeInterval = 15 * 60 + 30
    let start = min(Date(), endsAt.addingTimeInterval(-minimum))
    let calendar = Calendar.current
    let parts: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
    let schedule = DeviceActivitySchedule(
      intervalStart: calendar.dateComponents(parts, from: start),
      intervalEnd: calendar.dateComponents(parts, from: endsAt),
      repeats: false
    )
    try center.startMonitoring(Self.activityName, during: schedule)
  }

  private func loadSelection() -> FamilyActivitySelection? {
    guard let data = defaults?.data(forKey: Self.selectionKey) else { return nil }
    return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  private func saveSelection(_ selection: FamilyActivitySelection) {
    if let data = try? JSONEncoder().encode(selection) {
      defaults?.set(data, forKey: Self.selectionKey)
    }
  }

  static func count(_ s: FamilyActivitySelection) -> Int {
    s.applicationTokens.count + s.categoryTokens.count + s.webDomainTokens.count
  }

  static func summary(_ s: FamilyActivitySelection?) -> [String: Int] {
    [
      "applications": s?.applicationTokens.count ?? 0,
      "categories": s?.categoryTokens.count ?? 0,
      "webDomains": s?.webDomainTokens.count ?? 0,
    ]
  }

  static func describe(_ status: AuthorizationStatus) -> String {
    switch status {
    case .notDetermined: return "notDetermined"
    case .denied: return "denied"
    case .approved: return "approved"
    @unknown default:
      // .approvedWithDataAccess (newer SDKs) still means shields are allowed.
      return String(describing: status).lowercased().hasPrefix("approved") ? "approved" : "unknown"
    }
  }
}

struct PickerSheet: View {
  @State var selection: FamilyActivitySelection
  let onFinish: (FamilyActivitySelection?) -> Void

  var body: some View {
    NavigationStack {
      FamilyActivityPicker(selection: $selection)
        .navigationTitle("Apps to block")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") { onFinish(nil) }
          }
          ToolbarItem(placement: .confirmationAction) {
            Button("Done") { onFinish(selection) }
          }
        }
    }
    .preferredColorScheme(.dark)
  }
}
