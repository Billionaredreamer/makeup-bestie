import type { CapacitorConfig } from "@capacitor/cli";

// This wraps the deployed Next.js web app (Vercel) in a native iOS shell.
// The WebView loads the live production site directly, so camera/mic/WebRTC
// and all API routes keep working exactly as they do on the web today.
//
// IMPORTANT: update `server.url` if your production domain is different.
const config: CapacitorConfig = {
  appId: "com.makeupbestie.app",
  appName: "Makeup Bestie",
  webDir: "public",
  server: {
    url: "https://www.makeupbestie.app",
    cleartext: false,
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
