const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);

// Force a single SDK 54 copy of Clerk's crypto deps (avoids nested SDK 55 + ExpoCryptoAES crash in Expo Go).
config.resolver.extraNodeModules = {
  'expo-crypto': path.resolve(projectRoot, 'node_modules/expo-crypto'),
  'expo-auth-session': path.resolve(projectRoot, 'node_modules/expo-auth-session'),
  'expo-web-browser': path.resolve(projectRoot, 'node_modules/expo-web-browser'),
};

module.exports = config;
