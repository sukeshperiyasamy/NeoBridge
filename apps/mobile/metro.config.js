// Learn more: https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Metro watches the whole monorepo. Keep it out of folders that churn and
// aren't app code: the API's local database and firmware build output.
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  /[\\/]apps[\\/]api[\\/]\.data[\\/].*/,
  /[\\/]firmware[\\/]build[\\/].*/,
];

module.exports = config;
