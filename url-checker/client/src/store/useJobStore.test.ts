import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockApi = vi.hoisted(() => ({
  fetchJobs: vi.fn(),
  fetchJobDetails: vi.fn(),
  createJob: vi.fn(),
  cancelJob: vi.fn(),
}));

vi.mock('../api/client', () => mockApi);

import { useJobStore } from './useJobStore';

describe('useJobStore', () => {
  beforeEach(() => {
    mockApi.fetchJobs.mockReset();
    mockApi.fetchJobDetails.mockReset();
    mockApi.createJob.mockReset();
    mockApi.cancelJob.mockReset();
    useJobStore.setState({
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
    });
  });

  it('setFilters updates state', () => {
    useJobStore.getState().setFilters({ page: 3, limit: 50 });
    const state = useJobStore.getState();
    expect(state.page).toBe(3);
    expect(state.limit).toBe(50);
  });

  it('fetchJobs loads jobs and updates meta', async () => {
    mockApi.fetchJobs.mockResolvedValueOnce({
      data: [
        {
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          createdAt: 1,
          status: 'completed',
          successCount: 1,
          errorCount: 0,
          totalUrls: 1,
        },
      ],
      meta: { page: 1, limit: 20, total: 1 },
    });
    await useJobStore.getState().fetchJobs();
    const state = useJobStore.getState();
    expect(state.jobs).toHaveLength(1);
    expect(state.total).toBe(1);
  });

  it('createJob sets activeJobId', async () => {
    mockApi.createJob.mockResolvedValueOnce('job-xyz');
    const id = await useJobStore.getState().createJob(['https://a.test']);
    expect(id).toBe('job-xyz');
    expect(useJobStore.getState().activeJobId).toBe('job-xyz');
  });

  it('setActiveJob changes the active id, clearActiveJob nulls it', () => {
    useJobStore.getState().setActiveJob('abc');
    expect(useJobStore.getState().activeJobId).toBe('abc');
    useJobStore.getState().clearActiveJob();
    expect(useJobStore.getState().activeJobId).toBeNull();
  });

  it('setActiveJob triggers an immediate fetchJobDetails for the new id', async () => {
    mockApi.fetchJobDetails.mockResolvedValueOnce({
      id: 'x',
      createdAt: 0,
      status: 'completed',
      items: [],
      successCount: 0,
      errorCount: 0,
    });
    useJobStore.getState().setActiveJob('x');
    await new Promise((r) => setTimeout(r, 0));
    expect(mockApi.fetchJobDetails).toHaveBeenCalledWith('x');
    expect(useJobStore.getState().activeJobId).toBe('x');
  });

  it('fetchJobDetails does not commit stale data for an old activeJobId', async () => {
    let resolveFirst!: (v: unknown) => void;
    mockApi.fetchJobDetails.mockImplementationOnce(
      () => new Promise((r) => { resolveFirst = r; }),
    );
    useJobStore.setState({ activeJobId: 'first' });
    const firstCall = useJobStore.getState().fetchJobDetails('first');
    useJobStore.setState({ activeJobId: 'second', activeJobDetails: null });
    resolveFirst({
      id: 'first',
      createdAt: 0,
      status: 'completed',
      items: [],
      successCount: 0,
      errorCount: 0,
    });
    await firstCall;
    expect(useJobStore.getState().activeJobDetails).toBeNull();
  });

  it('cancelActiveJob returns null when no active job', async () => {
    const result = await useJobStore.getState().cancelActiveJob();
    expect(result).toBeNull();
    expect(mockApi.cancelJob).not.toHaveBeenCalled();
  });

  it('cancelActiveJob calls API when active', async () => {
    mockApi.cancelJob.mockResolvedValueOnce({
      id: 'x',
      createdAt: 0,
      status: 'cancelled',
      items: [],
      successCount: 0,
      errorCount: 0,
    });
    useJobStore.getState().setActiveJob('x');
    const result = await useJobStore.getState().cancelActiveJob();
    expect(mockApi.cancelJob).toHaveBeenCalledWith('x');
    expect(result?.status).toBe('cancelled');
  });

  it('mergeJobSummary upserts into the list', () => {
    useJobStore.getState().mergeJobSummary({
      id: 'a',
      createdAt: 1,
      status: 'completed',
      successCount: 2,
      errorCount: 1,
      items: [],
    });
    const state1 = useJobStore.getState();
    expect(state1.jobs).toHaveLength(1);
    expect(state1.jobs[0]).toMatchObject({ id: 'a', status: 'completed', totalUrls: 0 });

    useJobStore.getState().mergeJobSummary({
      id: 'a',
      createdAt: 1,
      status: 'failed',
      successCount: 0,
      errorCount: 2,
      items: [],
    });
    const state2 = useJobStore.getState();
    expect(state2.jobs).toHaveLength(1);
    expect(state2.jobs[0]?.status).toBe('failed');
    expect(state2.jobs[0]?.errorCount).toBe(2);
  });
});
