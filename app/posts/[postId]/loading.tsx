function ShimmerBlock({ className }: { className: string }) {
  return <div className={`animate-pulse bg-slate-800/70 ${className}`} />;
}

export default function Loading() {
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-black text-white">
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pb-6 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <ShimmerBlock className="h-10 w-24 rounded-full" />
        <ShimmerBlock className="h-10 w-20 rounded-full" />
      </div>

      <ShimmerBlock className="absolute inset-0 bg-slate-900" />

      <div className="relative z-10 mt-auto space-y-2 px-4 pb-28 pr-16">
        <ShimmerBlock className="h-4 w-32 rounded-full" />
        <ShimmerBlock className="h-3 w-48 rounded-full" />
        <ShimmerBlock className="h-4 w-full rounded-full" />
      </div>

      <div className="absolute bottom-28 right-3 z-10 flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <ShimmerBlock key={`post-loading-rail-${index}`} className="h-10 w-10 rounded-full" />
        ))}
      </div>
    </div>
  );
}
