import TcpSocket from 'react-native-tcp-socket';
import { api } from './api';

/**
 * Sends a test receipt directly from the device to the printer via TCP.
 *
 * The cloud API server cannot reach a local-network printer (192.168.0.x is
 * unreachable from the internet). Instead:
 *   1. We ask the server to build the ESC/POS bytes (it knows nothing about TCP).
 *   2. We open the TCP socket ourselves — the device IS on the same LAN.
 */
export async function sendTestPrint(printerIp: string, printerPort = 9100): Promise<void> {
  const result = await api.director.printerBytes();
  const base64 = result.data.bytes;

  const bytes = base64ToUint8Array(base64);

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
      { host: printerIp, port: printerPort, connectTimeout: 8000 },
      () => {
        socket.write(bytes, undefined, (writeErr) => {
          if (writeErr) { done(writeErr); return; }
          socket.end();
        });
      },
    );

    socket.on('close', () => done());
    socket.on('error', (err: Error) => done(err));
    socket.on('timeout', () =>
      done(new Error(`Printer timeout: could not reach ${printerIp}:${printerPort}`)),
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
