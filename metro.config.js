const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
// The server is a separate Node package; keep it out of the app bundle.
config.resolver.blockList = [/\/server\/.*/];
module.exports = config;
