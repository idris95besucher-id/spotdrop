"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

type ChatImageBubbleProps = {
  imageUrl: string;
  isOwnMessage: boolean;
};

/** Shared photo-message bubble — DM, group, and City Room all render the same component. */
export default function ChatImageBubble({ imageUrl, isOwnMessage }: ChatImageBubbleProps) {
  const [fullScreen, setFullScreen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setFullScreen(true)}
        className={`block max-w-[240px] shrink-0 overflow-hidden ${
          isOwnMessage ? "rounded-2xl rounded-br-md" : "rounded-2xl rounded-bl-md"
        }`}
      >
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="max-h-80 w-full object-cover"
          draggable={false}
        />
      </button>

      {fullScreen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95"
              onClick={() => setFullScreen(false)}
            >
              <button
                type="button"
                onClick={() => setFullScreen(false)}
                aria-label="Close"
                className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
              <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain" />
            </div>,
            document.body
          )
        : null}
    </>
  );
}
