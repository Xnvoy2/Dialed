import DeviceActivity
import FamilyControls
import Foundation
import ManagedSettings

/// Handles the two shield buttons.
/// - "Back to focus": counts it and closes the app.
/// - "Open for 5 minutes": counts it, exempts only this app, and schedules the
///   monitor extension to re-block it. Nothing about which app is recorded.
class ShieldActionExtension: ShieldActionDelegate {
  private let store = ManagedSettingsStore(named: ManagedSettingsStore.Name("lockin.focus"))
  private let grace = DeviceActivityName("lockin.grace")
  private let graceSeconds: TimeInterval = 5 * 60

  private var defaults: UserDefaults? {
    let id = Bundle.main.bundleIdentifier ?? ""
    let app = id.split(separator: ".").dropLast().joined(separator: ".")
    return UserDefaults(suiteName: "group.\(app)")
  }

  private func increment(_ key: String) {
    guard let d = defaults else { return }
    d.set(d.integer(forKey: key) + 1, forKey: key)
  }

  private func savedSelection() -> FamilyActivitySelection? {
    guard let data = defaults?.data(forKey: "lockin.selection.v1") else { return nil }
    return try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
  }

  /// Re-block after the grace period. DeviceActivity needs a 15-minute
  /// interval, so it starts in the past and ends at the grace end.
  /// The main app also re-applies on its next foreground as a fallback.
  private func scheduleRegrant() {
    let until = Date().addingTimeInterval(graceSeconds)
    defaults?.set(until.timeIntervalSince1970 * 1000, forKey: "lockin.grace.until")
    let start = until.addingTimeInterval(-(15 * 60 + 30))
    let parts: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
    let schedule = DeviceActivitySchedule(
      intervalStart: Calendar.current.dateComponents(parts, from: start),
      intervalEnd: Calendar.current.dateComponents(parts, from: until),
      repeats: false
    )
    let center = DeviceActivityCenter()
    center.stopMonitoring([grace])
    try? center.startMonitoring(grace, during: schedule)
  }

  override func handle(
    action: ShieldAction,
    for application: ApplicationToken,
    completionHandler: @escaping (ShieldActionResponse) -> Void
  ) {
    switch action {
    case .primaryButtonPressed:
      increment("lockin.count.backToFocus")
      completionHandler(.close)
    case .secondaryButtonPressed:
      increment("lockin.count.exits")
      if var apps = store.shield.applications { apps.remove(application); store.shield.applications = apps.isEmpty ? nil : apps }
      if let cats = savedSelection()?.categoryTokens, !cats.isEmpty {
        store.shield.applicationCategories = .specific(cats, except: [application])
      }
      scheduleRegrant()
      completionHandler(.defer)
    @unknown default:
      completionHandler(.close)
    }
  }

  override func handle(
    action: ShieldAction,
    for webDomain: WebDomainToken,
    completionHandler: @escaping (ShieldActionResponse) -> Void
  ) {
    switch action {
    case .primaryButtonPressed:
      increment("lockin.count.backToFocus")
      completionHandler(.close)
    case .secondaryButtonPressed:
      increment("lockin.count.exits")
      if var sites = store.shield.webDomains { sites.remove(webDomain); store.shield.webDomains = sites.isEmpty ? nil : sites }
      scheduleRegrant()
      completionHandler(.defer)
    @unknown default:
      completionHandler(.close)
    }
  }

  override func handle(
    action: ShieldAction,
    for category: ActivityCategoryToken,
    completionHandler: @escaping (ShieldActionResponse) -> Void
  ) {
    if action == .primaryButtonPressed { increment("lockin.count.backToFocus") }
    completionHandler(.close)
  }
}
