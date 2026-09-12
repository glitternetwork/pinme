import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { delayWithAbortCheck } from '../../bin/utils/delayWithAbortCheck';

describe('chunk upload retry delay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('waits for the full delay and releases timers and the abort listener', async () => {
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, 'addEventListener');
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const completed = vi.fn();
    const wait = delayWithAbortCheck(1000, controller.signal).then(completed);

    await vi.advanceTimersByTimeAsync(999);
    expect(completed).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await wait;

    expect(completed).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalledWith(
      'abort',
      addListener.mock.calls[0][1],
    );
    controller.abort();
    expect(removeListener).toHaveBeenCalledOnce();
  });

  test('rejects a pre-aborted signal without creating timers or listeners', async () => {
    const controller = new AbortController();
    controller.abort();
    const addListener = vi.spyOn(controller.signal, 'addEventListener');

    await expect(delayWithAbortCheck(1000, controller.signal)).rejects.toThrow(
      'Request cancelled',
    );

    expect(vi.getTimerCount()).toBe(0);
    expect(addListener).not.toHaveBeenCalled();
  });

  test('rejects immediately on abort and releases the timer and listener', async () => {
    const controller = new AbortController();
    const addListener = vi.spyOn(controller.signal, 'addEventListener');
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const wait = delayWithAbortCheck(1000, controller.signal);
    const rejection = expect(wait).rejects.toThrow('Request cancelled');
    await vi.advanceTimersByTimeAsync(100);

    controller.abort();
    await rejection;

    expect(vi.getTimerCount()).toBe(0);
    expect(removeListener).toHaveBeenCalledWith(
      'abort',
      addListener.mock.calls[0][1],
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(removeListener).toHaveBeenCalledOnce();
  });
});
