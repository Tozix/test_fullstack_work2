import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { ZodValidationPipe } from './pipes/zod-validation.pipe';
import { CreateJobSchema, IdParamSchema, PaginationSchema } from './schema';

@Controller('jobs')
export class JobsController {
  constructor(private readonly service: JobsService) {}

  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(CreateJobSchema))
    body: { urls: string[] },
  ): { jobId: string } {
    const job = this.service.create(body.urls);
    return { jobId: job.id };
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(PaginationSchema))
    query: {
      page: number;
      limit: number;
      sortBy: 'createdAt';
      sortOrder: 'asc' | 'desc';
    },
  ) {
    return this.service.findAll(query);
  }

  @Get(':id')
  detail(@Param(new ZodValidationPipe(IdParamSchema)) params: { id: string }) {
    return this.service.findOne(params.id);
  }

  @Delete(':id')
  @HttpCode(200)
  cancel(@Param(new ZodValidationPipe(IdParamSchema)) params: { id: string }) {
    return this.service.cancel(params.id);
  }
}
