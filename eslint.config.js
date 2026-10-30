// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'server/*', 'ios/*', 'android/*', 'build/*', 'targets/*'],
  },
  {
    // These rules exist for React Compiler, which this app doesn't use. The flagged
    // code is deliberate: a ticking clock, data reads keyed on a version counter,
    // and random confetti positions fixed once per sheet.
    rules: {
      'react-hooks/purity': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/use-memo': 'off',
    },
  },
]);
