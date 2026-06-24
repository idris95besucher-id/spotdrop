export function formatSpotMusicDuration(durationSeconds: number | null | undefined) {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }

  const total = Math.round(durationSeconds);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
