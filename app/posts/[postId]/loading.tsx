function ShimmerBlock({ className }: { className: string }) {
  return <div className={`animate-pulse bg-slate-800/70 ${className}`} />;
}

export default function Loading() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-slate-950 text-white">
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-slate-950/95 px-4 py-3">
        <ShimmerBlock className="h-10 w-10 rounded-full" />
        <ShimmerBlock className="h-4 w-12 rounded-full" />
      </div>

      <div className="flex-1 space-y-5">
        <ShimmerBlock className="aspect-[4/5] w-full rounded-none bg-slate-900 sm:aspect-square" />
        <div className="space-y-6 px-4 pb-8">
          <div className="space-y-3">
            <ShimmerBlock className="h-3 w-20 rounded-full" />
            <ShimmerBlock className="h-4 w-11/12 rounded-full" />
            <ShimmerBlock className="h-4 w-7/12 rounded-full" />
          </div>

          <div className="space-y-4 border-t border-white/10 pt-5">
            <div className="flex gap-2">
              <ShimmerBlock className="h-10 w-24 rounded-full" />
              <ShimmerBlock className="h-10 w-28 rounded-full" />
            </div>
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`post-loading-comment-${index}`} className="flex gap-3">
                <ShimmerBlock className="h-9 w-9 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <ShimmerBlock className="h-3 w-32 rounded-full" />
                  <ShimmerBlock className="h-4 w-full rounded-full" />
                  <ShimmerBlock className="h-4 w-2/3 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
