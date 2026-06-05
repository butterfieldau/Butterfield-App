const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Fix: "enumeration redeclared with different underlying type 'NSInteger' (was 'NSUInteger')"
 *
 * @react-native-google-signin/google-signin v16.x uses GoogleSignIn SDK 9.x, which
 * changed several enum underlying types from NSUInteger to NSInteger. Without modular
 * headers, Clang sees both definitions in the same compilation unit and throws a hard
 * redeclaration error during the Xcode build.
 *
 * Enabling :modular_headers => true for GoogleSignIn and its dependencies
 * (AppAuth, GTMAppAuth, GTMSessionFetcher) properly namespaces each SDK's symbols
 * so conflicting definitions never appear in the same compilation unit.
 *
 * This plugin runs after `expo prebuild` generates the Podfile and inserts explicit
 * pod declarations with modular headers right after `use_expo_modules!`.
 */
module.exports = function withGoogleSignInFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile'
      );

      if (!fs.existsSync(podfilePath)) {
        return config;
      }

      let podfile = fs.readFileSync(podfilePath, 'utf8');

      if (podfile.includes('# BF_GOOGLE_SIGN_IN_FIX')) {
        return config;
      }

      const injection = [
        '',
        '  # BF_GOOGLE_SIGN_IN_FIX: Enable modular headers for Google SDK pods.',
        '  # Prevents "enumeration redeclared with different underlying type" Xcode build errors',
        '  # caused by GoogleSignIn 9.x enum type changes (NSUInteger -> NSInteger) leaking',
        '  # across compilation units when headers are not properly namespaced.',
        "  pod 'GoogleSignIn', :modular_headers => true",
        "  pod 'AppAuth', :modular_headers => true",
        "  pod 'GTMAppAuth', :modular_headers => true",
        "  pod 'GTMSessionFetcher', :modular_headers => true",
        '',
      ].join('\n');

      // Match the full use_expo_modules! line (with or without arguments / trailing content)
      // and append the injection after it.
      const expoModulesLineRegex = /^([ \t]*use_expo_modules!.*)/m;

      if (!expoModulesLineRegex.test(podfile)) {
        console.warn(
          '[withGoogleSignInFix] Could not find "use_expo_modules!" in Podfile — skipping patch.'
        );
        return config;
      }

      podfile = podfile.replace(expoModulesLineRegex, `$1${injection}`);

      fs.writeFileSync(podfilePath, podfile);
      console.log(
        '[withGoogleSignInFix] Applied Google SDK modular-headers fix to Podfile.'
      );

      return config;
    },
  ]);
};
