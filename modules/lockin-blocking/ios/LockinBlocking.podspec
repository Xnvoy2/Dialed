Pod::Spec.new do |s|
  s.name           = 'LockinBlocking'
  s.version        = '1.0.0'
  s.summary        = 'Screen Time blocking spike'
  s.description    = 'FamilyControls, ManagedSettings and DeviceActivity proof of concept'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '17.6'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'FamilyControls', 'ManagedSettings', 'DeviceActivity', 'SwiftUI'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
