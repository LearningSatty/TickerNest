import {
  ArgumentMetadata,
  BadRequestException,
  PipeTransform,
} from '@nestjs/common';
import { ZodType } from 'zod';

/**
 * Pipe runs ONLY on `@Body()` parameters. When attached at the method level
 * via `@UsePipes(new ZodValidationPipe(schema))`, NestJS calls the pipe for
 * every handler argument — including @Param/@Query/@Req which would fail
 * the body schema. We short-circuit those and only validate the body.
 *
 * Use it as a method-level annotation; controllers don't need to know about
 * this internal detail.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}
  transform(value: unknown, meta: ArgumentMetadata) {
    if (meta.type !== 'body') return value;
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        kind: 'validation_error',
        issues: r.error.issues,
      });
    }
    return r.data;
  }
}
