const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Pod spec names to exclude from consumer builds.
// react-native-tcp-socket is POS-only hardware — not needed in consumer binary.
// react-native-keyboard-controller has been removed from the project entirely
// (replaced with RN built-ins) so it no longer appears here.
const EXCLUDED_POD_PREFIXES = [
  'react-native-tcp-socket',
];

/**
 * Ruby snippet injected into the Podfile as a post_install hook.
 *
 * Why post_install (not pre_install + analysis_result.specifications.reject!):
 *   - CocoaPods 1.15 does NOT fully populate `analysis_result` during
 *     `pre_install`. The `reject!` call runs but silently removes nothing,
 *     so the pod is still compiled and linked — the bug that caused the
 *     iOS 26 startup crash.
 *   - `post_install` has full access to the resolved Xcode project via
 *     `installer.pods_project`. Setting EXCLUDED_SOURCE_FILE_NAMES to
 *     "$(SRCROOT)/**" in every build configuration effectively voids the
 *     pod's compilation without removing it from the dependency graph.
 *     This is reliable across CocoaPods 1.13–1.15+.
 */
const POST_INSTALL_HOOK = `
# Consumer build: remove POS-only pods v3 (post_install, CocoaPods 1.15 safe).
# pre_install + analysis_result.specifications.reject! silently fails in
# CocoaPods 1.15 — analysis_result is not fully populated at that hook point.
# post_install has full access to the resolved Xcode project and is reliable.
post_install do |installer|
  pods_to_remove = ${JSON.stringify(EXCLUDED_POD_PREFIXES)}
  installer.pods_project.targets.each do |target|
    next unless pods_to_remove.any? { |pod| target.name.start_with?(pod) }
    target.build_configurations.each do |config|
      config.build_settings['COMPILER_FLAGS'] = ''
      config.build_settings['EXCLUDED_SOURCE_FILE_NAMES'] = '$(SRCROOT)/**'
    end
  end
  installer.pods_project.save
end
`;

/**
 * Config plugin that injects a Podfile post_install hook to remove
 * POS-only native pods from consumer builds.
 *
 * These are POS/Shop Display hardware modules that have no role in the
 * consumer binary. Expo's prebuild autolinking includes them regardless
 * of react-native.config.js — this plugin removes them at the Xcode
 * project level so they are never compiled into or linked with the consumer IPA.
 *
 * Set IS_POS_BUILD=1 in the EAS build profile environment to keep them.
 */
module.exports = function withPodfileExclusion(config) {
  if (process.env.IS_POS_BUILD === '1') {
    console.log('[withPodfileExclusion] IS_POS_BUILD=1 — keeping tcp-socket pod for POS build.');
    return config;
  }

  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const podfilePath = path.join(modConfig.modRequest.platformProjectRoot, 'Podfile');

      if (!fs.existsSync(podfilePath)) {
        console.warn('[withPodfileExclusion] Podfile not found at:', podfilePath);
        return modConfig;
      }

      let podfileContents = fs.readFileSync(podfilePath, 'utf8');

      // Idempotent — do not inject the hook twice across repeated prebuild runs.
      // Sentinel bumped to v3 so EAS doesn't reuse a cached Podfile with the
      // old broken pre_install hook.
      if (podfileContents.includes('Consumer build: remove POS-only pods v3')) {
        console.log('[withPodfileExclusion] Podfile already patched (v3) — skipping.');
        return modConfig;
      }

      // Append the post_install hook at the end of the Podfile.
      // post_install must be at the top level (not inside a target block).
      // Appending at the end is safe — CocoaPods collects all post_install
      // hooks regardless of position.
      podfileContents += '\n' + POST_INSTALL_HOOK;

      fs.writeFileSync(podfilePath, podfileContents, 'utf8');
      console.log(
        '[withPodfileExclusion] Injected post_install hook (v3) to exclude POS-only pods from consumer build.',
        'Excluded prefixes:', EXCLUDED_POD_PREFIXES.join(', '),
      );

      return modConfig;
    },
  ]);
};
