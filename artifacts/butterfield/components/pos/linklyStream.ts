import { api, getToken } from '@/lib/api';
export { sendLinklyReceiptPrint } from '@/lib/printer';

export const LINKLY_ACTIVE_SESSION_KEY = 'linkly_active_session_v1';

export const LINKLY_POLL_CONFIG = {
  ACTIVE_POLL_MS: 1000,
  PENDING_POLL_MS: 1500,
  BACKOFF_STEPS_MS: [1000, 2000, 4000, 8000] as const,
  BACKOFF_MAX_CONSECUTIVE: 4,
  MAX_ACTIVE_DURATION_MS: 180_000,
  IDLE_HEARTBEAT_MS: 20_000,
} as const;

const LINKLY_API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : '/api';

export type LinklyStreamResult = {
  approved: boolean;
  complete: boolean;
  amountSurchargeCents?: number;
  receiptText?: string | null;
  responseText: string;
};

export type LinklyStreamControl = { cancel: () => void; resetAndRetry: () => void };

export function startLinklyStream(
  sessionId: string,
  onText: (text: string) => void,
  onComplete: (pd: LinklyStreamResult) => void,
  onConsecutiveErrors?: (count: number) => void,
  onPollTimeout?: () => void,
): LinklyStreamControl {
  let cancelled = false;
  let sseConnected = false;
  let abortController: AbortController | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveErrors = 0;
  const startTime = Date.now();

  const cancel = () => {
    cancelled = true;
    abortController?.abort();
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  };

  const backoffMs = (): number => {
    const idx = Math.min(consecutiveErrors - 1, LINKLY_POLL_CONFIG.BACKOFF_STEPS_MS.length - 1);
    return LINKLY_POLL_CONFIG.BACKOFF_STEPS_MS[Math.max(0, idx)] ?? LINKLY_POLL_CONFIG.BACKOFF_STEPS_MS[LINKLY_POLL_CONFIG.BACKOFF_STEPS_MS.length - 1]!;
  };

  const doPoll = async () => {
    if (cancelled) return;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }

    if (Date.now() - startTime > LINKLY_POLL_CONFIG.MAX_ACTIVE_DURATION_MS) {
      cancel();
      onPollTimeout?.();
      return;
    }

    try {
      const pollRes = await api.pos.linklyPoll(sessionId) as any;
      if (cancelled) return;
      const pd = pollRes?.data;
      if (pd?.responseText) onText(pd.responseText);

      if (pd?.complete) {
        consecutiveErrors = 0;
        onConsecutiveErrors?.(0);
        cancel();
        onComplete(pd);
        return;
      }

      const classification = (pd?.pollClassification ?? 'pending') as string;
      if (classification === 'timeout' || classification === 'error') {
        consecutiveErrors++;
        onConsecutiveErrors?.(consecutiveErrors);
        if (!cancelled) pollTimer = setTimeout(doPoll, backoffMs());
      } else {
        if (consecutiveErrors > 0) {
          consecutiveErrors = 0;
          onConsecutiveErrors?.(0);
        }
        if (!cancelled) pollTimer = setTimeout(doPoll, LINKLY_POLL_CONFIG.ACTIVE_POLL_MS);
      }
    } catch {
      if (!cancelled) {
        consecutiveErrors++;
        onConsecutiveErrors?.(consecutiveErrors);
        pollTimer = setTimeout(doPoll, backoffMs());
      }
    }
  };

  const resetAndRetry = () => {
    if (cancelled) return;
    consecutiveErrors = 0;
    onConsecutiveErrors?.(0);
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    doPoll();
  };

  pollTimer = setTimeout(() => {
    if (!sseConnected && !cancelled) doPoll();
  }, LINKLY_POLL_CONFIG.PENDING_POLL_MS);

  (async () => {
    if (cancelled) return;
    try {
      const token = await getToken();
      if (cancelled) return;
      abortController = new AbortController();
      const response = await fetch(
        `${LINKLY_API_BASE}/pos/linkly/transaction/${encodeURIComponent(sessionId)}/stream`,
        {
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
          signal: abortController.signal,
        },
      );

      if (!response.ok || !response.body) {
        if (!cancelled) { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } doPoll(); }
        return;
      }

      sseConnected = true;
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }

      const reader = (response.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!cancelled) {
        const { value, done } = await reader.read();

        if (value?.byteLength) {
          buffer += decoder.decode(value, { stream: !done });
        }

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        let handled = false;
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data && typeof data.complete === 'boolean') {
                if (data.responseText) onText(data.responseText);
                cancel();
                onComplete(data);
                handled = true;
                break;
              }
            } catch {}
          } else if (line.startsWith('event: timeout')) {
            handled = true;
            break;
          }
        }
        if (handled) break;
        if (done) break;
      }

      if (!cancelled) pollTimer = setTimeout(doPoll, 0);
    } catch {
      if (!cancelled) { if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; } doPoll(); }
    }
  })();

  return { cancel, resetAndRetry };
}
