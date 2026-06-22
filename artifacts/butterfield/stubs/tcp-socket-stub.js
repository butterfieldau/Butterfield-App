/**
 * Fallback stub for react-native-tcp-socket.
 *
 * Production builds include the real module so Shop Display devices can reach
 * each shop's local receipt printer. Keep this file only as a defensive fallback
 * for environments that cannot load native modules.
 */

const TcpSocket = {
  createConnection: () => {
    throw new Error(
      'Direct printer connection requires a custom development build or the production POS app — ' +
      'this build does not support TCP socket connections to local network printers.'
    );
  },
};

module.exports = TcpSocket;
module.exports.default = TcpSocket;
