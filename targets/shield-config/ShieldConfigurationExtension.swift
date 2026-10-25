import Foundation
import ManagedSettings
import ManagedSettingsUI
import UIKit

/// The screen shown over a blocked app: the user's own reason, a way back,
/// and a deliberate exit. Neutral greys, no shaming. Sandboxed with no
/// network access; it reads only the reason and end time from the App Group.
class ShieldConfigurationExtension: ShieldConfigurationDataSource {
  private var defaults: UserDefaults? {
    let id = Bundle.main.bundleIdentifier ?? ""
    let app = id.split(separator: ".").dropLast().joined(separator: ".")
    return UserDefaults(suiteName: "group.\(app)")
  }

  private var subtitle: String {
    let d = defaults
    var until = ""
    if let endsAt = d?.object(forKey: "lockin.shield.endsAt") as? Double {
      let f = DateFormatter()
      f.timeStyle = .short
      until = " Until \(f.string(from: Date(timeIntervalSince1970: endsAt / 1000)))."
    }
    if let reason = d?.string(forKey: "lockin.shield.reason"), !reason.isEmpty {
      return "You said you wanted to: \(reason).\(until)"
    }
    return "You chose to block this app for now.\(until)"
  }

  private func make() -> ShieldConfiguration {
    ShieldConfiguration(
      backgroundBlurStyle: .systemUltraThinMaterialDark,
      backgroundColor: UIColor(red: 0.067, green: 0.067, blue: 0.071, alpha: 1),
      icon: UIImage(systemName: "lock"),
      title: ShieldConfiguration.Label(text: "You’re locked in", color: .white),
      subtitle: ShieldConfiguration.Label(text: subtitle, color: UIColor(white: 0.66, alpha: 1)),
      primaryButtonLabel: ShieldConfiguration.Label(text: "Back to focus", color: .black),
      primaryButtonBackgroundColor: .white,
      secondaryButtonLabel: ShieldConfiguration.Label(text: "Open for 5 minutes", color: UIColor(white: 0.66, alpha: 1))
    )
  }

  override func configuration(shielding application: Application) -> ShieldConfiguration { make() }
  override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration { make() }
  override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration { make() }
  override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration { make() }
}
