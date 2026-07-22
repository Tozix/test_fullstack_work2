import { z } from 'zod';

export const CreateJobSchema = z.object({
  urls: z
    .array(z.string().url())
    .min(1, 'Provide at least one URL')
    .max(500, 'Maximum 500 URLs per job'),
});

export type CreateJobInput = z.infer<typeof CreateJobSchema>;

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type PaginationInput = z.infer<typeof PaginationSchema>;

export const IdParamSchema = z.object({
  id: z.string().uuid('Invalid job id'),
});

export type IdParamInput = z.infer<typeof IdParamSchema>;
