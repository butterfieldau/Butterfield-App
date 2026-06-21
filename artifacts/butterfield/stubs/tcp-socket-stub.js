/**
 * Consumer-build stub for react-native-tcp-socket
 *
 * react-native-tcp-socket is a POS/Shop Display hardware module used only
 * to open raw TCP connections to local-network receipt printers. It has no
 * role in the consumer binary and its native initialisation at launch can
 * destabilise the TurboModule registry on iOS 26.
 *
 * This stub replaces the module for all non-POS builds (IS_POS_BUILD !== '1').
 * lib/printer.ts wraps all TCP calls in try/catch and surfaces a user-friendly
 * "hardware unavailable" message when createConnection is not available.
 */

const TcpSocket = {
  createConnection: () => {
    throw new Error(
      'Direct printer connection requires a custom development build or the production POS app — ' +
      'this consumer build does not support TCP socket connections to local network printers.'
    );
  },
};

module.exports = TcpSocket;
module.exports.default = TcpSocket;
