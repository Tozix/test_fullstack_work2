import { Module } from '@nestjs/common';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  controllers: [JobsController],
  providers: [
    {
      provide: JobsService,
      useFactory: () => new JobsService(),
    },
  ],
})
export class JobsModule {}
