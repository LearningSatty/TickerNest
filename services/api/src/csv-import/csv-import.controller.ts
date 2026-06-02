import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CsvImportService } from './csv-import.service';
import { z } from 'zod';

const CommitDto = z.object({ mode: z.enum(['REPLACE', 'MERGE']) });

@Controller('imports')
export class CsvImportController {
  constructor(private readonly svc: CsvImportService) {}

  /** Stage a CSV upload and return a diff preview. No trades created yet. */
  @Post(':brokerId/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  preview(
    @Req() req: { user?: { id: string } },
    @Headers('idempotency-key') idem: string | undefined,
    @Param('brokerId') brokerId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!req.user) throw new UnauthorizedException();
    if (!idem) throw new UnauthorizedException('Idempotency-Key required');
    return this.svc.preview(req.user.id, brokerId, idem, file.buffer);
  }

  /** Confirm a previously-staged import and write the trades. */
  @Post(':importId/commit')
  commit(
    @Req() req: { user?: { id: string } },
    @Param('importId') importId: string,
    @Body() body: unknown,
  ) {
    if (!req.user) throw new UnauthorizedException();
    const parsed = CommitDto.parse(body);
    return this.svc.commit(req.user.id, importId, parsed.mode);
  }
}
