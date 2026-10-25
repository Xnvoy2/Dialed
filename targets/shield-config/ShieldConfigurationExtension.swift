import Foundation
import ManagedSettings
import ManagedSettingsUI
import UIKit

/// The screen shown over a shielded app. Neutral greys, no pressure.
/// Sandboxed with no network access; it reads only the session end time.
class ShieldConfigurationExtension: ShieldConfigurationDataSource {
  private var subtitle: String {
    let id = Bundle.main.bundleIdentifier ?? ""
    let app = id.split(separator: ".").dropLast().joined(separator: ".")
    if let endsAt = UserDefaults(suiteName: "group.\(app)")?.object(forKey: "lockin.shield.endsAt") as? Double {
      let f = DateFormatter()
      f.timeStyle = .short
      return "You chose to block this until \(f.string(from: Date(timeIntervalSince1970: endsAt / 1000)))."
    }
    return "You chose to block this during focus."
  }

  private func make() -> ShieldConfiguration {
    ShieldConfiguration(
      backgroundBlurStyle: .systemUltraThinMaterialDark,
      backgroundColor: UIColor(red: 0.086, green: 0.086, blue: 0.09, alpha: 1),
      icon: UIImage(systemName: "lock"),
      title: ShieldConfiguration.Label(text: "Focusing", color: .white),
      subtitle: ShieldConfiguration.Label(text: subtitle, color: UIColor(white: 0.62, alpha: 1)),
      primaryButtonLabel: ShieldConfiguration.Label(text: "OK", color: .black),
      primaryButtonBackgroundColor: .white
    )
  }

  override func configuration(shielding application: Application) -> ShieldConfiguration { make() }
  override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration { make() }
  override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration { make() }
  override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration { make() }
}
