export type JobStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ItemStatus =
  | 'pending'
  | 'in_progress'
  | 'success'
  | 'error'
  | 'cancelled';

export const TERMINAL_JOB_STATUSES: ReadonlySet<JobStatus> = new Set<JobStatus>([
  'completed',
  'failed',
  'cancelled',
]);

export const ACTIVE_ITEM_STATUSES: ReadonlySet<ItemStatus> =
  new Set<ItemStatus>(['pending', 'in_progress']);

export interface UrlItem {
  url: string;
  status: ItemStatus;
  httpStatus?: number;
  error?: string;
  startTime?: number;
  endTime?: number;
  duration?: number;
}

export interface Job {
  id: string;
  createdAt: number;
  status: JobStatus;
  items: UrlItem[];
  successCount: number;
  errorCount: number;
  abort?: AbortController;
}

export type JobSummary = Omit<Job, 'items' | 'abort'> & {
  totalUrls: number;
  hasTlsError: boolean;
};

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
}

export interface PagedJobs {
  data: JobSummary[];
  meta: PageMeta;
}
