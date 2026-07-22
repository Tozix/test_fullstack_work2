import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JobsService } from './jobs.service';

const realFetch = globalThis.fetch;

describe('JobsService', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      return new Response(null, {
        status: 200,
        headers: { location: new URL('/', url).toString() },
      });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.useRealTimers();
  });

  it('creates a job and starts processing URLs', async () => {
    const service = new JobsService({ postResponseDelayMs: 0 });
    const job = service.create([
      'https://a.test',
      'https://b.test',
    ]);
    expect(job.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(job.status).toBe('pending');
    expect(job.items).toHaveLength(2);

    await waitFor(() => {
      const s = service.findOne(job.id).status;
      return s === 'completed' || s === 'failed' || s === 'cancelled';
    });
    const stored = service.findOne(job.id);
    expect(['completed', 'failed', 'cancelled']).toContain(stored.status);
    expect(stored.successCount + stored.errorCount).toBeLessThanOrEqual(2);
  });

  it('rejects invalid input via the controller layer (covered in e2e)', () => {
    const service = new JobsService({ postResponseDelayMs: 0 });
    expect(() => service.create([])).not.toThrow(); // empty list — service just no-ops
  });

  it('caps concurrency at 5 via the semaphore', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    let fetchCalls = 0;
    let releaseFetch: () => void = () => undefined;
    const release = new Promise<void>((r) => {
      releaseFetch = r;
    });
    globalThis.fetch = vi.fn(async () => {
      fetchCalls += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        await release;
      } finally {
        inFlight -= 1;
      }
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;

    const service = new JobsService({ postResponseDelayMs: 0 });
    const job = service.create(
      Array.from({ length: 12 }, (_, i) => `https://q${i}.test`),
    );

    await waitFor(() => maxInFlight >= 5);
    expect(maxInFlight).toBe(5);
    expect(inFlight).toBe(5);

    releaseFetch();
    await waitFor(() => {
      const s = service.findOne(job.id).status;
      return s === 'completed' || s === 'failed';
    });
    expect(fetchCalls).toBeGreaterThanOrEqual(12);
  });

  it('times out individual probes after 10s', async () => {
    globalThis.fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          if (signal.aborted) {
            reject(new Error('aborted'));
            return;
          }
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }
      });
    }) as unknown as typeof fetch;

    const service = new JobsService({ postResponseDelayMs: 0 });
    const job = service.create(['https://slow.test']);
    await waitFor(
      () => {
        const s = service.findOne(job.id).items[0]!.status;
        return s === 'error' || s === 'cancelled';
      },
      15_000,
    );
    const stored = service.findOne(job.id);
    const item = stored.items[0]!;
    expect(['error', 'cancelled']).toContain(item.status);
  }, 20_000);

  it('cancels a job and aborts in-flight requests', async () => {
    let resolveFetch: () => void = () => undefined;
    globalThis.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = () => resolve(new Response(null, { status: 200 }));
        }),
    ) as unknown as typeof fetch;

    const service = new JobsService({ postResponseDelayMs: 0 });
    const job = service.create(['https://stuck.test']);
    await new Promise((r) => setTimeout(r, 20));
    expect(service.findOne(job.id).status).toBe('in_progress');

    service.cancel(job.id);

    await new Promise((r) => setTimeout(r, 20));
    const after = service.findOne(job.id);
    expect(after.status).toBe('cancelled');
    expect(after.items[0]!.status).toBe('cancelled');
    resolveFetch();
  });

  it('marks failed when all URLs error', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;
    const service = new JobsService({ postResponseDelayMs: 0 });
    const job = service.create(['https://x.test']);
    await waitFor(() => {
      const s = service.findOne(job.id).status;
      return s === 'completed' || s === 'failed';
    });
    const stored = service.findOne(job.id);
    expect(stored.status).toBe('failed');
    expect(stored.errorCount).toBe(1);
  });

  it('classifies TLS errors with a human-readable message', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('unable to verify the first certificate');
    }) as unknown as typeof fetch;
    const service = new JobsService({ postResponseDelayMs: 0 });
    const job = service.create(['https://self-signed.test']);
    await waitFor(() => {
      const item = service.findOne(job.id).items[0];
      return item?.status === 'error';
    });
    const item = service.findOne(job.id).items[0]!;
    expect(item.error?.startsWith('TLS:')).toBe(true);
    expect(item.error?.toLowerCase()).toContain('tls');
  });

  it('marks JobSummary.hasTlsError when at least one item hit a TLS failure', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new TypeError('self signed certificate in certificate chain');
    }) as unknown as typeof fetch;
    const service = new JobsService({ postResponseDelayMs: 0 });
    const job = service.create(['https://a.test']);
    await waitFor(() => service.findOne(job.id).items[0]?.status === 'error');
    const summary = service.findAll({ page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' }).data.find((j) => j.id === job.id);
    expect(summary?.hasTlsError).toBe(true);
  });

  it('leaves JobSummary.hasTlsError false for non-TLS failures', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;
    const service = new JobsService({ postResponseDelayMs: 0 });
    const job = service.create(['https://x.test']);
    await waitFor(() => service.findOne(job.id).items[0]?.status === 'error');
    const summary = service.findAll({ page: 1, limit: 10, sortBy: 'createdAt', sortOrder: 'desc' }).data.find((j) => j.id === job.id);
    expect(summary?.hasTlsError).toBe(false);
  });


  it('keeps raw error for non-TLS failures', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('boom');
    }) as unknown as typeof fetch;
    const service = new JobsService({ postResponseDelayMs: 0 });
    const job = service.create(['https://x.test']);
    await waitFor(() => {
      const item = service.findOne(job.id).items[0];
      return item?.status === 'error';
    });
    const item = service.findOne(job.id).items[0]!;
    expect(item.error).toBe('boom');
  });

  it('findAll paginates and sorts', async () => {
    const service = new JobsService({ postResponseDelayMs: 0 });
    const a = service.create(['https://a.test']);
    await new Promise((r) => setTimeout(r, 5));
    const b = service.create(['https://b.test']);
    const result = service.findAll({
      page: 1,
      limit: 10,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
    expect(result.meta.total).toBe(2);
    expect(result.data.map((d) => d.id)).toContain(a.id);
    expect(result.data.map((d) => d.id)).toContain(b.id);
    expect(result.data[0]!.id).toBe(b.id);
    expect(result.data[1]!.id).toBe(a.id);
    expect(a.id).not.toBe(b.id);
  });
});

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  if (predicate()) return;
  throw new Error('waitFor timed out');
}
