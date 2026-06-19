import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import AppProviders from "@/components/AppProviders";
import { THEME_BOOTSTRAP_SCRIPT } from "@/lib/themeAccent";
import { PASSWORD_RECOVERY_BOOTSTRAP_SCRIPT } from "@/lib/passwordRecoveryBootstrap";
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
  description: "City-based public chat rooms built with Next.js and Supabase.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SpotDrop",
  },
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
      className={`${geistSans.variable} ${geistMono.variable} h-full max-w-full overflow-x-hidden antialiased bg-[#050816] text-white`}
    >
      <body className="min-h-full w-full max-w-full overflow-x-hidden bg-[#050816] text-white">
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
