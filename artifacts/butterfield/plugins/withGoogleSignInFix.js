const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Fix: "The following Swift pods cannot yet be integrated as static libraries"
 *
 * @react-native-google-signin/google-signin v16.x uses GoogleSignIn SDK 9.x, which
 * changed several enum underlying types from NSUInteger to NSInteger. Without modular
 * headers, Clang sees both definitions in the same compilation unit and throws a hard
 * redeclaration error during the Xcode build.
 *
 * Additionally, AppCheckCore (pulled in transitively by Google Sign-In) depends on
 * GoogleUtilities and RecaptchaInterop, which do not define modules by default.
 * CocoaPods refuses to integrate them as static libraries without modular headers,
 * producing: "The Swift pod AppCheckCore depends upon GoogleUtilities and
 * RecaptchaInterop, which do not define modules."
 *
 * Enabling :modular_headers => true for all affected Google SDK pods properly
 * namespaces each SDK's symbols so conflicting definitions never appear in the
 * same compilation unit and all pods can be linked as static libraries.
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
        '  # Also fixes: "The Swift pod AppCheckCore depends upon GoogleUtilities and',
        '  # RecaptchaInterop, which do not define modules" static library integration error.',
        "  pod 'GoogleSignIn', :modular_headers => true",
        "  pod 'AppAuth', :modular_headers => true",
        "  pod 'GTMAppAuth', :modular_headers => true",
        "  pod 'GTMSessionFetcher', :modular_headers => true",
        "  pod 'AppCheckCore', :modular_headers => true",
        "  pod 'GoogleUtilities', :modular_headers => true",
        "  pod 'RecaptchaInterop', :modular_headers => true",
        '',
      ].join('\n');

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
