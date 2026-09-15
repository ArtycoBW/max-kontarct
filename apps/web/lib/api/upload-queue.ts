export interface UploadFailure<T> { item: T; message: string }

/** Sequential uploads bound memory and let one invalid file leave the rest intact. */
export async function runUploadQueue<T>(items: readonly T[], upload: (item: T, index: number) => Promise<unknown>, signal: AbortSignal) {
  const succeeded: T[] = [];
  const failed: UploadFailure<T>[] = [];
  for (const [index, item] of items.entries()) {
    if (signal.aborted) break;
    try {
      await upload(item, index);
      succeeded.push(item);
    } catch (error) {
      if (signal.aborted) break;
      failed.push({ item, message: error instanceof Error ? error.message : "Не удалось загрузить файл" });
    }
  }
  return { succeeded, failed };
}
