const isPOSBuild = process.env.IS_POS_BUILD === '1';

module.exports = {
  dependencies: {
    // Exclude native modules that are not required for the consumer iOS build.
    // Expo prebuild's autolinking still includes these via CocoaPods; the
    // withPodfileExclusion config plugin removes them at the Podfile level.
    // These RN CLI exclusions serve as an additional guard for the JS bundler.
    ...(!isPOSBuild && {
      'react-native-tcp-socket': {
        platforms: {
          ios: null,
        },
      },
      'react-native-keyboard-controller': {
        platforms: {
          ios: null,
        },
      },
    }),
  },
};
