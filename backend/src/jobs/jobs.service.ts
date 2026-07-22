import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ACTIVE_ITEM_STATUSES,
  Job,
  JobSummary,
  PagedJobs,
  TERMINAL_JOB_STATUSES,
  UrlItem,
} from './types';
import { Semaphore, sleep } from './utils/semaphore';
import { PaginationInput } from './schema';

const MAX_CONCURRENCY = 5;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const POST_RESPONSE_DELAY_MS = 10_000;
const TLS_ERROR_PREFIX = 'TLS:';

export interface JobsServiceOptions {
  postResponseDelayMs?: number;
}

@Injectable()
export class JobsService {
  private readonly jobs = new Map<string, Job>();
  private readonly postResponseDelayMs: number;

  constructor(options: JobsServiceOptions = {}) {
    this.postResponseDelayMs = options.postResponseDelayMs ?? POST_RESPONSE_DELAY_MS;
  }

  create(urls: string[]): Job {
    const items: UrlItem[] = urls.map((url) => ({
      url,
      status: 'pending',
    }));
    const job: Job = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      status: 'pending',
      items,
      successCount: 0,
      errorCount: 0,
      abort: new AbortController(),
    };
    this.jobs.set(job.id, job);
    const sem = new Semaphore(MAX_CONCURRENCY);
    queueMicrotask(() => {
      void this.processJob(job, sem).catch(() => undefined);
    });
    return job;
  }

  findAll(input: PaginationInput): PagedJobs {
    const { page, limit, sortBy, sortOrder } = input;
    const all = Array.from(this.jobs.values());
    all.sort((a, b) => {
      const cmp = sortBy === 'createdAt' ? a.createdAt - b.createdAt : 0;
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    const total = all.length;
    const offset = (page - 1) * limit;
    const slice = all.slice(offset, offset + limit).map(toSummary);
    return {
      data: slice,
      meta: { page, limit, total },
    };
  }

  findOne(id: string): Job {
    const job = this.jobs.get(id);
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  cancel(id: string): Job {
    const job = this.findOne(id);
    if (TERMINAL_JOB_STATUSES.has(job.status)) {
      return job;
    }
    job.abort?.abort();
    for (const item of job.items) {
      if (ACTIVE_ITEM_STATUSES.has(item.status)) {
        item.status = 'cancelled';
      }
    }
    job.status = 'cancelled';
    return job;
  }

  private async processJob(job: Job, sem: Semaphore): Promise<void> {
    if (job.items.length === 0) {
      job.status = 'completed';
      return;
    }
    job.status = 'in_progress';
    await Promise.all(job.items.map((item) => this.runOne(job, item, sem)));
    this.finalize(job);
  }

  private async runOne(job: Job, item: UrlItem, sem: Semaphore): Promise<void> {
    if (job.abort?.signal.aborted) {
      item.status = 'cancelled';
      return;
    }
    const release = await sem.acquire();
    try {
      if (job.abort?.signal.aborted) {
        item.status = 'cancelled';
        return;
      }
      item.status = 'in_progress';
      item.startTime = Date.now();

      const ac = new AbortController();
      const onJobAbort = () => ac.abort();
      job.abort?.signal.addEventListener('abort', onJobAbort, { once: true });
      const timeout = setTimeout(() => ac.abort(), TIMEOUT_MS);

      try {
        const result = await this.probe(item.url, ac.signal, 0);
        if (job.abort?.signal.aborted) {
          item.status = 'cancelled';
          return;
        }
        await sleep(Math.floor(Math.random() * this.postResponseDelayMs));
        item.httpStatus = result.status;
        item.status = 'success';
        job.successCount += 1;
      } catch (err) {
        if (job.abort?.signal.aborted) {
          item.status = 'cancelled';
        } else {
          const message = err instanceof Error ? err.message : 'Unknown error';
          item.error = message;
          item.status = 'error';
          job.errorCount += 1;
        }
      } finally {
        clearTimeout(timeout);
        job.abort?.signal.removeEventListener('abort', onJobAbort);
        item.endTime = Date.now();
        if (item.startTime != null && item.endTime != null) {
          item.duration = item.endTime - item.startTime;
        }
      }
    } finally {
      release();
    }
  }

  private async probe(
    url: string,
    signal: AbortSignal,
    hops: number,
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'HEAD',
        signal,
        redirect: 'manual',
      });
    } catch (err) {
      throw classifyFetchError(err);
    }
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location');
      if (!next) return response;
      if (hops + 1 > MAX_REDIRECTS) {
        throw new Error('Too many redirects');
      }
      const absolute = new URL(next, url).toString();
      return this.probe(absolute, signal, hops + 1);
    }
    return response;
  }

  private finalize(job: Job): void {
    if (job.status === 'cancelled') return;
    const total = job.items.length;
    const errored = job.items.filter((i) => i.status === 'error').length;
    if (total > 0 && errored === total) {
      job.status = 'failed';
    } else {
      job.status = 'completed';
    }
  }
}

function toSummary(job: Job): JobSummary {
  let hasTlsError = false;
  for (const item of job.items) {
    if (item.error?.startsWith(TLS_ERROR_PREFIX)) {
      hasTlsError = true;
      break;
    }
  }
  return {
    id: job.id,
    createdAt: job.createdAt,
    status: job.status,
    successCount: job.successCount,
    errorCount: job.errorCount,
    totalUrls: job.items.length,
    hasTlsError,
  };
}

const TLS_PATTERNS: ReadonlyArray<string> = [
  'certificate',
  'cert_',
  'unable to verify',
  'tls',
  'ssl',
  'eproto',
  'handshake',
];

function classifyFetchError(err: unknown): Error {
  if (!(err instanceof Error)) {
    return new Error('Unknown error');
  }
  const lower = err.message.toLowerCase();
  const isTls = TLS_PATTERNS.some((p) => lower.includes(p));
  if (isTls) {
    const reason = inferTlsReason(err.message);
    return new Error(`${TLS_ERROR_PREFIX} ${reason}`);
  }
  return err;
}

function inferTlsReason(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('unable to verify')) {
    return 'не удалось проверить цепочку сертификатов';
  }
  if (lower.includes('hostname') || lower.includes('altname')) {
    return 'имя хоста не совпадает с сертификатом';
  }
  if (lower.includes('expired')) {
    return 'срок действия сертификата истёк';
  }
  if (lower.includes('self') || lower.includes('self-signed')) {
    return 'самоподписанный сертификат';
  }
  if (lower.includes('handshake')) {
    return 'ошибка TLS-handshake';
  }
  return 'ошибка установки TLS-соединения';
}
