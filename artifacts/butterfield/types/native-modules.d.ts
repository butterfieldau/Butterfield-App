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
