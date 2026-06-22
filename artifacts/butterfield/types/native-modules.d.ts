declare module '@react-native-google-signin/google-signin' {
  export const GoogleSignin: {
    configure: (options?: Record<string, unknown>) => void;
    signIn: () => Promise<{ data?: { idToken?: string | null } }>;
  };
}

declare module 'react-native-maps' {
  const MapView: any;
  export default MapView;
  export const Marker: any;
}

// react-native-tcp-socket — native module for Shop Display LAN printer communication.
declare module 'react-native-tcp-socket' {
  export interface TcpSocketOptions {
    host: string;
    port: number;
    connectTimeout?: number;
    localAddress?: string;
    localPort?: number;
    interface?: 'wifi' | 'cellular' | 'ethernet';
    reuseAddress?: boolean;
  }

  export interface TcpSocket {
    write(data: Uint8Array | string, encoding?: string, cb?: (err: Error | null) => void): boolean;
    end(): void;
    destroy(): void;
    on(event: 'connect' | 'close' | 'drain', listener: () => void): this;
    on(event: 'data', listener: (data: Buffer) => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'timeout', listener: () => void): this;
  }

  const TcpSocket: {
    createConnection(options: TcpSocketOptions, callback?: () => void): TcpSocket;
  };
  export default TcpSocket;
}
