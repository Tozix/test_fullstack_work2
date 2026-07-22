import axios from 'axios';
import type { Job, JobSummary, PagedJobs } from '../types';

const baseURL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? '';

export const http = axios.create({
  baseURL,
  timeout: 15_000,
});

export interface ListParams {
  page?: number;
  limit?: number;
  sortBy?: 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export async function createJob(urls: string[]): Promise<string> {
  const res = await http.post<{ jobId: string }>('/api/jobs', { urls });
  return res.data.jobId;
}

export async function fetchJobs(params: ListParams = {}): Promise<PagedJobs> {
  const res = await http.get<PagedJobs>('/api/jobs', { params });
  return res.data;
}

export async function fetchJobDetails(id: string): Promise<Job> {
  const res = await http.get<Job>(`/api/jobs/${id}`);
  return res.data;
}

export async function cancelJob(id: string): Promise<Job> {
  const res = await http.delete<Job>(`/api/jobs/${id}`);
  return res.data;
}

export type { Job, JobSummary };
