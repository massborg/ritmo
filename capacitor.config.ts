import type { CapacitorConfig } from '@capacitor/cli';

// "Ritmo" is the label under the app icon. The store listing name is "Ritmo Running".
const config: CapacitorConfig = {
  appId: 'com.ritmorunning.app',
  appName: 'Ritmo',
  webDir: 'dist',
  backgroundColor: '#E8480C',
  ios: { contentInset: 'never', backgroundColor: '#E8480C' },
  android: { backgroundColor: '#E8480C' },
  plugins: {
    SplashScreen: {
      // The native splash shows the brand colour only; the animated "Run in" splash plays in the app.
      launchShowDuration: 0,
      launchAutoHide: true,
      backgroundColor: '#E8480C',
      showSpinner: false,
    },
    StatusBar: { overlaysWebView: true },
  },
};

export default config;
