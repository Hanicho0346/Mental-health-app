const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Some Windows environments block Metro's transformer child processes with
// `spawn EPERM`. A single worker keeps transforms in-process.
config.maxWorkers = 1;

module.exports = config;
