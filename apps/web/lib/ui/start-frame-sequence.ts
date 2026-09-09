/** Prefetch ~3 MB compressed; decode off-screen into a bounded bitmap window (~50 MB). */
export function createStartFrameSequence(canvas: HTMLCanvasElement, count: number, invalidate: () => void) {
  const context = canvas.getContext("2d", { alpha: false });
  const frames = new Map<number, ImageBitmap>();
  const blobs = new Map<number, Blob>();
  const fetching = new Set<number>();
  const decoding = new Set<number>();
  const failed = new Set<number>();
  const abort = new AbortController();
  let wanted = 0;
  let disposed = false;
  let lastPaint = -1;
  canvas.width = 540;
  canvas.height = 960;

  function pump() {
    if (disposed || !context || typeof createImageBitmap !== "function") return;
    const center = Math.floor(wanted);
    const candidates = [center, Math.min(count - 1, center + 1)];
    for (let offset = 1; offset <= 10; offset++) candidates.push(center + offset, center - offset);
    // Fetching is independent from decoding: network latency must not gate every animation frame.
    for (const index of [...candidates, ...Array.from({ length: count }, (_, index) => index)]) {
      if (fetching.size >= 6) break;
      if (index < 0 || index >= count || blobs.has(index) || fetching.has(index) || failed.has(index)) continue;
      fetching.add(index);
      void fetch(`/images/start-screen/frame-${String(index + 1).padStart(3, "0")}.webp`, { signal: abort.signal })
        .then(response => { if (!response.ok) throw new Error("Frame unavailable"); return response.blob(); })
        .then(blob => { if (!disposed) blobs.set(index, blob); })
        .catch(() => { failed.add(index); })
        .finally(() => { fetching.delete(index); pump(); });
    }
    for (const index of candidates) {
      if (decoding.size >= 2) break;
      const blob = blobs.get(index);
      if (!blob || frames.has(index) || decoding.has(index) || failed.has(index)) continue;
      decoding.add(index);
      void createImageBitmap(blob)
        .then(bitmap => {
          if (disposed) { bitmap.close(); return; }
          frames.set(index, bitmap);
          // Keep only nearby frames. The canvas retains its last complete drawing.
          for (const [key, value] of frames) if (Math.abs(key - wanted) > 12) { value.close(); frames.delete(key); }
          lastPaint = -1;
          invalidate();
        })
        .catch(() => { failed.add(index); })
        .finally(() => { decoding.delete(index); pump(); });
    }
  }
  return {
    render(progress: number) {
      wanted = Math.max(0, Math.min(count - 1, progress * (count - 1)));
      pump();
      if (!context || lastPaint === wanted) return;
      const lower = Math.floor(wanted);
      const first = frames.get(lower);
      const second = frames.get(Math.min(count - 1, lower + 1));
      if (!first) return; // Never replace a complete frame with a partial/empty image.
      context.globalAlpha = 1;
      context.drawImage(first, 0, 0, canvas.width, canvas.height);
      if (second && second !== first) {
        context.globalAlpha = wanted - lower;
        context.drawImage(second, 0, 0, canvas.width, canvas.height);
      }
      context.globalAlpha = 1;
      canvas.style.opacity = "1";
      lastPaint = wanted;
    },
    dispose() { disposed = true; abort.abort(); frames.forEach(frame => frame.close()); frames.clear(); blobs.clear(); },
  };
}
