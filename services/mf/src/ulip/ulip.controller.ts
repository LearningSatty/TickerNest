import {
  Body, Controller, Delete, Get, Param, Post, Put, Req, UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from '@tickernest/common';
import type { Request } from 'express';
import { UlipService } from './ulip.service';
import { CreateUlipDto, UpdateUlipDto } from './ulip.dto';

@Controller('ulip')
export class UlipController {
  constructor(private readonly svc: UlipService) {}

  @Get()
  list(@Req() req: Request) {
    return this.svc.list(req.user!.id);
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.svc.get(req.user!.id, id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateUlipDto))
  create(@Req() req: Request, @Body() body: any) {
    return this.svc.create(req.user!.id, body);
  }

  @Put(':id')
  @UsePipes(new ZodValidationPipe(UpdateUlipDto))
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.svc.update(req.user!.id, id, body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.svc.remove(req.user!.id, id);
  }
}
