"use client";

import { useEffect, useState } from "react";
import { X, Share } from "lucide-react";

const DISMISS_KEY = "sd_pwa_banner_dismissed";

function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  // Safari on iOS — exclude Chrome/CriOS/FxiOS/OPiOS which run on iOS but aren't Safari
  const isSafari = /safari/i.test(ua) && !/crios|fxios|opiOS|chrome/i.test(ua);
  return isIos && isSafari;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator &&
      (window.navigator as { standalone?: boolean }).standalone === true)
  );
}

export default function PwaInstallBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isIosSafari()) return;
    if (isStandalone()) return;
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!dismissed) setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Install SpotDrop"
      className="fixed bottom-[env(safe-area-inset-bottom,0px)] left-0 right-0 z-[200] px-4 pb-4"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
    >
      <div className="relative flex items-start gap-3 rounded-2xl border border-primary/20 bg-[#0b1026]/95 px-4 py-3.5 shadow-2xl shadow-black/60 backdrop-blur-xl">
        {/* SpotDrop icon */}
        <img
          src="/icon.png"
          alt="SpotDrop"
          className="h-12 w-12 shrink-0 rounded-xl border border-white/10 object-cover"
        />

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            Install <span className="text-primary">SpotDrop</span>
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-slate-400">
            Tap{" "}
            <Share className="inline-block h-3.5 w-3.5 align-[-2px] text-primary" aria-hidden />
            {" "}Share, then{" "}
            <strong className="font-semibold text-slate-200">Add to Home Screen</strong>
          </p>
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-full p-1 text-slate-500 transition hover:text-slate-300"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
