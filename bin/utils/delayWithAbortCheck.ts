export function delayWithAbortCheck(
  delay: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Request cancelled'));
      return;
    }

    const cleanup = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      cleanup();
      reject(new Error('Request cancelled'));
    };

    const timeoutId = setTimeout(() => {
      cleanup();
      if (signal.aborted) {
        reject(new Error('Request cancelled'));
      } else {
        resolve();
      }
    }, delay);

    signal.addEventListener('abort', onAbort, { once: true });
  });
}
