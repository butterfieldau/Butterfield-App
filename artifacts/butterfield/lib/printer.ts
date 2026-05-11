import { api } from './api';

/**
 * Sends a test receipt directly from the device to the printer via TCP.
 *
 * The cloud API server cannot reach a local-network printer (192.168.0.x is
 * unreachable from the internet). Instead:
 *   1. We ask the server to build the ESC/POS bytes (it knows nothing about TCP).
 *   2. We open the TCP socket ourselves — the device IS on the same LAN.
 *
 * react-native-tcp-socket is a native module that requires a custom development
 * build or production build (EAS Build). It is NOT available in Expo Go.
 * We use a dynamic import so Expo Go does not crash at module-load time — the
 * error is surfaced only when the user actually taps Send Test Print.
 */
export async function sendTestPrint(printerIp: string, printerPort = 9100): Promise<void> {
  const port = isNaN(printerPort) || printerPort <= 0 ? 9100 : printerPort;

  const result = await api.director.printerBytes();
  const base64 = result.data.bytes;
  const bytes = base64ToUint8Array(base64);

  // Dynamic import — deferred until print time, never evaluated at screen load.
  // In Expo Go this will throw (caught below); in EAS / production builds it works.
  let TcpSocket: any;
  try {
    const mod = await import('react-native-tcp-socket');
    TcpSocket = mod.default;
  } catch {
    throw new Error(
      'Direct printer connection requires a custom development build or the production app — ' +
      'Expo Go does not support TCP socket connections to local network printers.',
    );
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;

    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve();
    };

    const socket = TcpSocket.createConnection(
      { host: printerIp, port, connectTimeout: 8000 },
      () => {
        socket.write(bytes, undefined, (writeErr: Error | null) => {
          if (writeErr) { done(writeErr); return; }
          socket.end();
        });
      },
    );

    socket.on('close', () => done());
    socket.on('error', (err: Error) => done(err));
    socket.on('timeout', () =>
      done(new Error(`Printer timeout: could not reach ${printerIp}:${port}`)),
    );
  });
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
