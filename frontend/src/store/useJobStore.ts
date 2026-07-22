import { create } from 'zustand';
import {
  fetchJobDetails,
  fetchJobs,
  createJob as apiCreateJob,
  cancelJob as apiCancelJob,
} from '../api/client';
import { extractApiErrorMessage } from '../api/errors';
import { TERMINAL_JOB_STATUSES } from '../status';
import type { Job, JobStatus, JobSummary } from '../types';

const POLL_INTERVAL_MS = 2000;

function toSummary(job: Job): JobSummary {
  let hasTlsError = false;
  for (const item of job.items) {
    if (item.error?.startsWith('TLS:')) {
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

function isTerminalStatus(status: JobStatus | undefined): boolean {
  return status !== undefined && TERMINAL_JOB_STATUSES.has(status);
}

export interface JobStoreState {
  jobs: JobSummary[];
  total: number;
  page: number;
  limit: number;
  sortBy: 'createdAt';
  sortOrder: 'asc' | 'desc';
  loadingList: boolean;
  activeJobId: string | null;
  activeJobDetails: Job | null;
  loadingDetail: boolean;
  error: string | null;
  setFilters(filters: Partial<Pick<JobStoreState, 'page' | 'limit' | 'sortBy' | 'sortOrder'>>): void;
  fetchJobs(): Promise<void>;
  createJob(urls: string[]): Promise<string>;
  setActiveJob(id: string | null): void;
  clearActiveJob(): void;
  fetchJobDetails(id: string): Promise<Job | null>;
  cancelActiveJob(): Promise<Job | null>;
  mergeJobSummary(job: Job): void;
}

interface InternalActions {
  _syncPolling(): void;
  _stopAllTimers(): void;
}

export const useJobStore = create<JobStoreState & InternalActions>((set, get) => {
  const pollTimers = new Map<string, ReturnType<typeof setInterval>>();

  const stopTimerFor = (id: string) => {
    const t = pollTimers.get(id);
    if (t) {
      clearInterval(t);
      pollTimers.delete(id);
    }
  };

  const stopAllTimers = () => {
    for (const id of [...pollTimers.keys()]) stopTimerFor(id);
  };

  const ensureTimer = (id: string) => {
    if (pollTimers.has(id)) return;
    const timer = setInterval(() => {
      const summary = get().jobs.find((j) => j.id === id);
      if (!summary || isTerminalStatus(summary.status)) {
        stopTimerFor(id);
        return;
      }
      void get().fetchJobDetails(id);
    }, POLL_INTERVAL_MS);
    pollTimers.set(id, timer);
  };

  const syncPolling = () => {
    const { jobs, activeJobDetails } = get();
    const liveIds = new Set<string>();
    for (const j of jobs) {
      if (!isTerminalStatus(j.status)) liveIds.add(j.id);
    }
    if (
      activeJobDetails &&
      activeJobDetails.id &&
      !isTerminalStatus(activeJobDetails.status)
    ) {
      liveIds.add(activeJobDetails.id);
    }

    for (const id of pollTimers.keys()) {
      if (!liveIds.has(id)) stopTimerFor(id);
    }
    for (const id of liveIds) ensureTimer(id);
  };

  const touchPolling = () => {
    queueMicrotask(syncPolling);
  };

  return {
    jobs: [],
    total: 0,
    page: 1,
    limit: 20,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    loadingList: false,

    activeJobId: null,
    activeJobDetails: null,
    loadingDetail: false,

    error: null,

    setFilters(filters) {
      set((state) => ({ ...state, ...filters }));
      void get().fetchJobs();
    },

    async fetchJobs() {
      const { page, limit, sortBy, sortOrder } = get();
      set({ loadingList: true, error: null });
      try {
        const res = await fetchJobs({ page, limit, sortBy, sortOrder });
        set({ jobs: res.data, total: res.meta.total, loadingList: false });
        touchPolling();
      } catch (e) {
        set({ loadingList: false, error: extractApiErrorMessage(e, 'Не удалось загрузить список заданий') });
      }
    },

    async createJob(urls) {
      set({ error: null });
      const jobId = await apiCreateJob(urls);
      set({ activeJobId: jobId, activeJobDetails: null });
      void get().fetchJobs();
      void get().fetchJobDetails(jobId);
      return jobId;
    },

    setActiveJob(id) {
      if (id === null) {
        set({ activeJobId: null, activeJobDetails: null });
        return;
      }
      if (id === get().activeJobId) return;
      set({ activeJobId: id, activeJobDetails: null });
      touchPolling();
      void get().fetchJobDetails(id);
    },

    clearActiveJob() {
      set({ activeJobId: null, activeJobDetails: null });
    },

    async fetchJobDetails(id) {
      set({ loadingDetail: true });
      try {
        const job = await fetchJobDetails(id);
        if (get().activeJobId === id) {
          set({ activeJobDetails: job, loadingDetail: false });
        } else {
          set({ loadingDetail: false });
        }
        get().mergeJobSummary(job);
        if (isTerminalStatus(job.status)) {
          stopTimerFor(id);
        }
        return job;
      } catch (e) {
        set({
          loadingDetail: false,
          error: extractApiErrorMessage(e, 'Не удалось загрузить детали задания'),
        });
        stopTimerFor(id);
        return null;
      }
    },

    mergeJobSummary(job) {
      const summary = toSummary(job);
      set((state) => {
        const idx = state.jobs.findIndex((j) => j.id === job.id);
        const next = state.jobs.slice();
        if (idx >= 0) {
          next[idx] = summary;
        } else {
          next.unshift(summary);
        }
        return { jobs: next, total: Math.max(state.total, next.length) };
      });
      if (isTerminalStatus(summary.status)) {
        stopTimerFor(summary.id);
      }
      touchPolling();
    },

    async cancelActiveJob() {
      const id = get().activeJobId;
      if (!id) return null;
      try {
        const job = await apiCancelJob(id);
        set({ activeJobDetails: job });
        stopTimerFor(id);
        get().mergeJobSummary(job);
        void get().fetchJobs();
        return job;
      } catch (e) {
        set({ error: extractApiErrorMessage(e, 'Не удалось отменить задание') });
        return null;
      }
    },

    _syncPolling: syncPolling,
    _stopAllTimers: stopAllTimers,
  };
});

if (typeof window !== 'undefined') {
  (window as unknown as { __clearJobStoreTimers?: () => void }).__clearJobStoreTimers = () => {
    useJobStore.getState()._stopAllTimers();
  };
}
