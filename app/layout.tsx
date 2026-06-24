import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import AppProviders from "@/components/AppProviders";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/themeAccent";
import { PASSWORD_RECOVERY_BOOTSTRAP_SCRIPT } from "@/lib/passwordRecoveryBootstrap";
import { CAPACITOR_LAUNCH_BOOTSTRAP_SCRIPT } from "@/lib/capacitorLaunchBootstrap";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SpotDrop",
  description: "Discover city spots, join local chat rooms, and share your world.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SpotDrop",
    startupImage: "/icon.png",
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: [
      { url: "/icon.png", sizes: "1024x1024", type: "image/png" },
    ],
    shortcut: "/icon.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#050816",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="spotdrop-night-v1"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full w-full max-w-full overflow-hidden antialiased bg-[#050816] text-white`}
    >
      <body className="h-full w-full max-w-full overflow-hidden bg-[#050816] text-white">
        <Script id="spotdrop-capacitor-platform" strategy="beforeInteractive">{`
          (function(){
            try {
              var cap = window.Capacitor;
              if (cap && cap.isNativePlatform && cap.isNativePlatform() && cap.getPlatform && cap.getPlatform() === 'ios') {
                document.documentElement.dataset.capacitorPlatform = 'ios';
              }
            } catch(e) {}
          })();
        `}</Script>
        <Script id="spotdrop-capacitor-launch" strategy="beforeInteractive">
          {CAPACITOR_LAUNCH_BOOTSTRAP_SCRIPT}
        </Script>
        <Script id="spotdrop-password-recovery-bootstrap" strategy="beforeInteractive">
          {PASSWORD_RECOVERY_BOOTSTRAP_SCRIPT}
        </Script>
        <Script id="spotdrop-theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
