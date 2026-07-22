import type { ItemStatus, JobStatus } from './types';

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pending: 'в ожидании',
  in_progress: 'выполняется',
  completed: 'завершено',
  failed: 'ошибка',
  cancelled: 'отменено',
};

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  pending: 'в ожидании',
  in_progress: 'выполняется',
  success: 'успех',
  error: 'ошибка',
  cancelled: 'отменено',
};

export const JOB_STATUS_COLORS: Record<JobStatus, string> = {
  pending: 'default',
  in_progress: 'blue',
  completed: 'green',
  failed: 'red',
  cancelled: 'orange',
};

export const ITEM_STATUS_COLORS: Record<ItemStatus, string> = {
  pending: 'default',
  in_progress: 'blue',
  success: 'green',
  error: 'red',
  cancelled: 'orange',
};

export const TERMINAL_JOB_STATUSES = new Set<JobStatus>([
  'completed',
  'failed',
  'cancelled',
]);
