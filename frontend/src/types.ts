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
}

export interface JobSummary {
  id: string;
  createdAt: number;
  status: JobStatus;
  successCount: number;
  errorCount: number;
  totalUrls: number;
  hasTlsError: boolean;
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
}

export interface PagedJobs {
  data: JobSummary[];
  meta: PageMeta;
}
