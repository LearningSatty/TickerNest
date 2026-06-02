import {
  Body, Controller, Delete, Get, Param, Post, Put, Req, UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from '@tickernest/common';
import type { Request } from 'express';
import { AssetsService } from './assets.service';
import { CreateAssetDto, UpdateAssetDto, CreateEventDto } from './assets.dto';

@Controller('assets')
export class AssetsController {
  constructor(private readonly svc: AssetsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.svc.list(req.user!.id);
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.svc.get(req.user!.id, id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateAssetDto))
  create(@Req() req: Request, @Body() body: any) {
    return this.svc.create(req.user!.id, body);
  }

  @Put(':id')
  @UsePipes(new ZodValidationPipe(UpdateAssetDto))
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.svc.update(req.user!.id, id, body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.svc.remove(req.user!.id, id);
  }

  @Post(':id/events')
  @UsePipes(new ZodValidationPipe(CreateEventDto))
  addEvent(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.svc.addEvent(req.user!.id, id, body);
  }

  @Get(':id/events')
  listEvents(@Req() req: Request, @Param('id') id: string) {
    return this.svc.listEvents(req.user!.id, id);
  }
}
