export function spotUploadLog(message: string, detail?: unknown) {
  if (detail !== undefined) {
    console.log(message, detail);
    return;
  }

  console.log(message);
}

export function spotUploadTime(label: string) {
  const startedAt = performance.now();

  spotUploadLog(`[Spot Upload] ${label} start`);

  return () => {
    const elapsedMs = Math.round(performance.now() - startedAt);
    spotUploadLog(`[Spot Upload] ${label} end`, { elapsedMs });
    return elapsedMs;
  };
}
