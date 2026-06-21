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

  // For non-POS builds, swap TCP socket for a safe no-op stub.
  if (!isPOSBuild && moduleName === "react-native-tcp-socket") {
    return {
      filePath: path.resolve(__dirname, "stubs/tcp-socket-stub.js"),
      type: "sourceFile",
    };
  }

  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
