import type { ReactNode } from "react";

type ChatThreadShellProps = {
  children: ReactNode;
};

export default function ChatThreadShell({ children }: ChatThreadShellProps) {
  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-[#050816] text-white">
      {children}
    </div>
  );
}
