/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'shield-config',
  name: 'LockinShieldConfig',
  bundleIdentifier: '.shield',
  deploymentTarget: '17.6',
  entitlements: {
    'com.apple.developer.family-controls': true,
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
