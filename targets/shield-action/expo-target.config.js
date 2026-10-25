/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'shield-action',
  name: 'LockinShieldAction',
  bundleIdentifier: '.action',
  deploymentTarget: '17.6',
  frameworks: ['ManagedSettings', 'FamilyControls', 'DeviceActivity'],
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
