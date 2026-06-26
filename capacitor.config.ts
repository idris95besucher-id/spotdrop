import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.idrisgazimagomaev.spotdropapp',
  appName: 'SpotDrop',
  webDir: 'out',
  server: {
    // Load profile HTML directly (correct RSC payload); recover via errorPath on failure.
    appStartPath: 'profile/index.html',
    errorPath: 'capacitor-error.html',
  },
  plugins: {
    FirebaseMessaging: {
      presentationOptions: ['alert', 'badge', 'sound'],
    },
  },
  ios: {
    // Allow the WKWebView to extend edge-to-edge (behind status bar and home indicator).
    // Safe-area insets are then handled via CSS: env(safe-area-inset-*) at the root wrapper.
    contentInset: 'never',
    // Disable the WKWebView's own rubber-band scrolling — the web app controls all scroll.
    scrollEnabled: false,
    // Prevent accidental long-press link previews in the native layer.
    allowsLinkPreview: false,
  },
};

export default config;
