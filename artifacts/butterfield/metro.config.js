const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const isPOSBuild = process.env.IS_POS_BUILD === '1';

const originalResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && moduleName === "@stripe/stripe-react-native") {
    return {
      filePath: path.resolve(__dirname, "stubs/stripe-react-native-web.js"),
      type: "sourceFile",
    };
  }

  // For non-POS builds, swap Star IO and TCP socket for safe no-op stubs.
  // This prevents the native module from being evaluated at module-load time
  // and surfaces a clear "hardware unavailable" error only if the user
  // actually triggers a print action in a consumer build.
  if (!isPOSBuild) {
    if (moduleName === "react-native-star-io10") {
      return {
        filePath: path.resolve(__dirname, "stubs/star-io10-stub.js"),
        type: "sourceFile",
      };
    }
    if (moduleName === "react-native-tcp-socket") {
      return {
        filePath: path.resolve(__dirname, "stubs/tcp-socket-stub.js"),
        type: "sourceFile",
      };
    }
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
