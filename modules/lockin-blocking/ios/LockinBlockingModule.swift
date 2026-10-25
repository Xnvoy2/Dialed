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
  static let activityName = DeviceActivityName("lockin.session")
  static let selectionKey = "lockin.selection.v1"

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
    AsyncFunction("startShield") { (endsAtMs: Double) -> [String: Any] in
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
      self.defaults?.set(endsAtMs, forKey: "lockin.shield.endsAt")
      return result
    }

    AsyncFunction("stopShield") { () -> [String: Any] in
      self.store.clearAllSettings()
      DeviceActivityCenter().stopMonitoring([Self.activityName])
      self.defaults?.removeObject(forKey: "lockin.shield.endsAt")
      return ["shielded": self.isShielded()]
    }

    Function("shieldState") { () -> [String: Any] in
      var state: [String: Any] = [
        "shielded": self.isShielded(),
        "monitoring": DeviceActivityCenter().activities.contains(Self.activityName),
      ]
      if let endsAt = self.defaults?.object(forKey: "lockin.shield.endsAt") as? Double {
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
