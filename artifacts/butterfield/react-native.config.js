const isPOSBuild = process.env.IS_POS_BUILD === '1';

module.exports = {
  dependencies: {
    // Exclude native modules that are not required for the consumer iOS build.
    // react-native-tcp-socket is POS-only hardware; the withPodfileExclusion
    // config plugin removes it at the Podfile level (post_install hook).
    // This RN CLI exclusion serves as an additional guard for the JS bundler.
    // react-native-keyboard-controller has been fully removed from the project.
    ...(!isPOSBuild && {
      'react-native-tcp-socket': {
        platforms: {
          ios: null,
        },
      },
    }),
  },
};
