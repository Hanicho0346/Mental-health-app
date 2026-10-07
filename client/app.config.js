/** Expo config — cleartext HTTP only in non-production builds. */
const appJson = require('./app.json');

const IS_PRODUCTION =
  process.env.APP_ENV === 'production' ||
  process.env.EAS_BUILD_PROFILE === 'production' ||
  process.env.NODE_ENV === 'production';

module.exports = () => {
  const base = appJson.expo;

  return {
    expo: {
      ...base,
      ios: {
        ...base.ios,
        infoPlist: {
          ...(base.ios?.infoPlist ?? {}),
          NSAppTransportSecurity: IS_PRODUCTION
            ? {}
            : {
                NSAllowsLocalNetworking: true,
                NSAllowsArbitraryLoads: true,
              },
        },
      },
      android: {
        ...base.android,
        usesCleartextTraffic: !IS_PRODUCTION,
      },
    },
  };
};
