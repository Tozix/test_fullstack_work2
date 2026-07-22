import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { ZodError, ZodType } from 'zod';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Validation failed',
        details: this.flatten(result.error),
      });
    }
    return result.data;
  }

  private flatten(err: ZodError): unknown {
    return err.issues.map((i) => ({
      path: i.path,
      message: i.message,
      code: i.code,
    }));
  }
}
