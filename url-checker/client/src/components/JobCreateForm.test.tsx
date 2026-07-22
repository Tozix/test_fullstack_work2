import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from 'antd';

const mocks = vi.hoisted(() => ({
  createJob: vi.fn(),
  setActiveJob: vi.fn(),
}));

vi.mock('../store/useJobStore', () => ({
  useJobStore: (selector: (s: unknown) => unknown) => {
    const state = {
      createJob: mocks.createJob,
      setActiveJob: mocks.setActiveJob,
    };
    return selector(state);
  },
}));

import { JobCreateForm } from './JobCreateForm';
import { DEMO_URLS } from '../data/demo-urls';

function renderForm() {
  return render(
    <App>
      <JobCreateForm />
    </App>,
  );
}

describe('JobCreateForm', () => {
  beforeEach(() => {
    mocks.createJob.mockReset();
    mocks.setActiveJob.mockReset();
    mocks.createJob.mockImplementation(async (_urls: string[]) => 'mock-job-id-1234');
  });

  it('renders the input and both buttons', () => {
    renderForm();
    expect(screen.getByTestId('urls-input')).toBeInTheDocument();
    expect(screen.getByTestId('submit-button')).toBeInTheDocument();
    expect(screen.getByTestId('template-button')).toBeInTheDocument();
    expect(screen.getByText('Запустить проверку')).toBeInTheDocument();
    expect(screen.getByText('Шаблон')).toBeInTheDocument();
  });

  it('submits non-empty URLs and triggers createJob + setActiveJob', async () => {
    renderForm();
    const input = screen.getByTestId('urls-input') as HTMLTextAreaElement;
    await userEvent.type(input, 'https://a.test\nhttps://b.test\n\n');
    await userEvent.click(screen.getByTestId('submit-button'));

    expect(mocks.createJob).toHaveBeenCalledTimes(1);
    expect(mocks.createJob).toHaveBeenCalledWith([
      'https://a.test',
      'https://b.test',
    ]);
    expect(mocks.setActiveJob).toHaveBeenCalledWith('mock-job-id-1234');
  });

  it('does not call createJob when input is empty/whitespace', async () => {
    renderForm();
    await userEvent.click(screen.getByTestId('submit-button'));
    expect(mocks.createJob).not.toHaveBeenCalled();
  });

  it('template button fills the textarea with demo URLs', async () => {
    renderForm();
    await userEvent.click(screen.getByTestId('template-button'));
    const input = screen.getByTestId('urls-input') as HTMLTextAreaElement;
    expect(input.value.split('\n').filter((l) => l.trim().length > 0))
      .toEqual([...DEMO_URLS]);
  });

  it('template button shows confirm modal when textarea already has content', async () => {
    renderForm();
    const input = screen.getByTestId('urls-input') as HTMLTextAreaElement;
    await userEvent.type(input, 'https://existing.test\n');
    await userEvent.click(screen.getByTestId('template-button'));
    expect(await screen.findByRole('dialog', {}, { timeout: 3000 })).toBeInTheDocument();
    expect(input.value).toContain('https://existing.test');
  });
});
