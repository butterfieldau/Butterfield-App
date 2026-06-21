const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Pod spec names to exclude from consumer builds.
// react-native-star-io10 has been removed from the project entirely.
// tcp-socket is POS-only hardware, and keyboard-controller is disabled on iOS
// to avoid a TurboModule startup exception on iOS 26 / arm64e.
const EXCLUDED_POD_PREFIXES = [
  'react-native-tcp-socket',
  'react-native-keyboard-controller',
];

/**
 * Ruby snippet injected into the Podfile as a pre_install hook.
 *
 * Why pre_install + analysis_result.specifications.reject!:
 *   - `pre_install` runs before CocoaPods resolves, integrates, or generates
 *     the Pods.xcodeproj. Removing a spec here means the pod is never compiled
 *     or linked — the most deterministic exclusion point possible.
 *   - `installer.pods_project` (used by many guides) is NOT available in
 *     pre_install; it only exists after `pod install` creates the project.
 *     Manipulating it in post_install is too late to prevent compilation.
 *   - analysis_result.specifications is the canonical pre-integration list;
 *     reject! on it is the standard RN community pattern for pod exclusion.
 */
const PRE_INSTALL_HOOK = `
# Consumer build: remove POS-only pods before CocoaPods integrates them.
# These native modules are irrelevant in the consumer binary and their
# TurboModule eager-init causes a SIGABRT startup crash on iOS 26 / arm64e.
# Using pre_install + analysis_result.specifications.reject! is the
# deterministic exclusion point — pods removed here are never compiled or linked.
pre_install do |installer|
  pods_to_remove = ${JSON.stringify(EXCLUDED_POD_PREFIXES)}
  installer.analysis_result.specifications.reject! do |spec|
    pods_to_remove.any? { |pod_name| spec.name.start_with?(pod_name) }
  end
end
`;

/**
 * Config plugin that injects a Podfile pre_install hook to remove
 * StarIO10 and react-native-tcp-socket from non-POS consumer builds.
 *
 * These are POS/Shop Display hardware modules that have no role in the
 * consumer binary. Expo's prebuild autolinking includes them regardless
 * of react-native.config.js — this plugin removes them at the spec-resolution
 * level so they are never compiled into or linked with the consumer IPA.
 *
 * Set IS_POS_BUILD=1 in the EAS build profile environment to keep them.
 */
module.exports = function withPodfileExclusion(config) {
  if (process.env.IS_POS_BUILD === '1') {
    console.log('[withPodfileExclusion] IS_POS_BUILD=1 — keeping StarIO10 and tcp-socket pods for POS build.');
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
      if (podfileContents.includes('Consumer build: remove POS-only pods')) {
        console.log('[withPodfileExclusion] Podfile already patched — skipping.');
        return modConfig;
      }

      // Inject the pre_install hook at the top level of the Podfile, before
      // the first `target` block. Expo-generated Podfiles begin with platform
      // and plugin lines before the first `target 'butterfield' do` block.
      // Appending before the target block ensures we're at the top level (not
      // nested inside a target), which is required for pre_install hooks.
      const targetMatch = podfileContents.match(/^target\s+['"][\w-]+['"]\s+do\b/m);
      if (targetMatch && targetMatch.index !== undefined) {
        podfileContents =
          podfileContents.slice(0, targetMatch.index) +
          PRE_INSTALL_HOOK + '\n' +
          podfileContents.slice(targetMatch.index);
      } else {
        // Fallback: append at the very end if we can't locate the target block.
        console.warn('[withPodfileExclusion] Could not locate target block — appending pre_install hook at end of Podfile.');
        podfileContents += '\n' + PRE_INSTALL_HOOK;
      }

      fs.writeFileSync(podfilePath, podfileContents, 'utf8');
      console.log(
        '[withPodfileExclusion] Injected pre_install hook to exclude POS-only pods from consumer build.',
        'Excluded prefixes:', EXCLUDED_POD_PREFIXES.join(', '),
      );

      return modConfig;
    },
  ]);
};
