const isPOSBuild = process.env.IS_POS_BUILD === '1';

module.exports = {
  dependencies: {
    // Exclude POS-only native modules from consumer builds.
    // Expo prebuild's autolinking still includes these via CocoaPods; the
    // withPodfileExclusion config plugin removes them at the Podfile level.
    // These RN CLI exclusions serve as an additional guard for the JS bundler.
    ...(!isPOSBuild && {
      'react-native-star-io10': {
        platforms: {
          ios: null,
        },
      },
      'react-native-tcp-socket': {
        platforms: {
          ios: null,
        },
      },
    }),
  },
};
