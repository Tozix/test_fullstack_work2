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

export const useJobStore = create<JobStoreState>((set, get) => {
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  const stopPolling = () => {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };

  const startPolling = (id: string) => {
    stopPolling();
    pollTimer = setInterval(() => {
      if (get().activeJobId !== id) {
        stopPolling();
        return;
      }
      const details = get().activeJobDetails;
      if (details && isTerminalStatus(details.status)) {
        stopPolling();
        return;
      }
      void get().fetchJobDetails(id);
    }, POLL_INTERVAL_MS);
  };

  const activateJob = (id: string) => {
    set({ activeJobId: id, activeJobDetails: null });
    const summary = get().jobs.find((j) => j.id === id);
    if (!isTerminalStatus(summary?.status)) {
      startPolling(id);
    }
    void get().fetchJobDetails(id);
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
      } catch (e) {
        set({ loadingList: false, error: extractApiErrorMessage(e, 'Не удалось загрузить список заданий') });
      }
    },

    async createJob(urls) {
      set({ error: null });
      const jobId = await apiCreateJob(urls);
      stopPolling();
      set({ activeJobId: jobId, activeJobDetails: null });
      void get().fetchJobs();
      void get().fetchJobDetails(jobId);
      startPolling(jobId);
      return jobId;
    },

    setActiveJob(id) {
      if (id === null) {
        stopPolling();
        set({ activeJobId: null, activeJobDetails: null });
        return;
      }
      if (id === get().activeJobId) return;
      stopPolling();
      activateJob(id);
    },

    clearActiveJob() {
      stopPolling();
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
          stopPolling();
        }
        return job;
      } catch (e) {
        set({
          loadingDetail: false,
          error: extractApiErrorMessage(e, 'Не удалось загрузить детали задания'),
        });
        stopPolling();
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
    },

    async cancelActiveJob() {
      const id = get().activeJobId;
      if (!id) return null;
      try {
        const job = await apiCancelJob(id);
        set({ activeJobDetails: job });
        stopPolling();
        get().mergeJobSummary(job);
        void get().fetchJobs();
        return job;
      } catch (e) {
        set({ error: extractApiErrorMessage(e, 'Не удалось отменить задание') });
        return null;
      }
    },
  };
});
