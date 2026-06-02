import {
  Controller,
  Headers,
  Logger,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExcelImportService } from './excel-import.service';

@Controller('imports/excel')
export class ExcelImportController {
  private readonly log = new Logger(ExcelImportController.name);
  constructor(private readonly svc: ExcelImportService) {}

  /**
   * One-shot Excel onboarding. Accepts My-Portfolio.xlsx (or compatible);
   * every broker sheet is ingested as its own CSV-import inside a single
   * TX. Returns a per-broker summary and the list of broker IDs created.
   */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async onboard(
    @Req() req: { user?: { id: string } },
    @Headers('idempotency-key') idemKey: string | undefined,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!req.user) throw new UnauthorizedException();
    if (!idemKey)
      throw new UnauthorizedException('Idempotency-Key header is required');
    return this.svc.onboard(req.user.id, idemKey, file.buffer);
  }
}
