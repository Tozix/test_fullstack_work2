import type { AxiosError } from 'axios';

interface ValidationDetail {
  path: (string | number)[];
  message: string;
  code: string;
}

interface ValidationErrorBody {
  statusCode?: number;
  error?: string;
  message?: unknown;
  details?: ValidationDetail[];
}

const HUMAN_FIELD: Record<string, string> = {
  urls: 'список URL',
  id: 'идентификатор',
  page: 'номер страницы',
  limit: 'размер страницы',
  sortBy: 'поле сортировки',
  sortOrder: 'направление сортировки',
};

function humanizeDetail(detail: ValidationDetail): string {
  const field = detail.path
    .map((p) => HUMAN_FIELD[String(p)] ?? String(p))
    .join('.');
  return field ? `${field}: ${detail.message}` : detail.message;
}

export function extractApiErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosError<ValidationErrorBody>;
  const body = axiosErr?.response?.data;
  if (body) {
    if (Array.isArray(body.details) && body.details.length > 0) {
      return body.details.map(humanizeDetail).join('; ');
    }
    if (typeof body.message === 'string') {
      return body.message;
    }
    if (Array.isArray(body.message)) {
      return body.message.join('; ');
    }
  }
  if (axiosErr?.message) return axiosErr.message;
  return fallback;
}
