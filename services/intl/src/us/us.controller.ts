import {
  Body, Controller, Delete, Get, Param, Post, Put, Req, UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from '@tickernest/common';
import type { Request } from 'express';
import { UsService } from './us.service';
import { CreateUsHoldingDto, UpdateUsHoldingDto } from './us.dto';

@Controller('us')
export class UsController {
  constructor(private readonly svc: UsService) {}

  @Get()
  list(@Req() req: Request) {
    return this.svc.list(req.user!.id);
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.svc.get(req.user!.id, id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateUsHoldingDto))
  create(@Req() req: Request, @Body() body: any) {
    return this.svc.create(req.user!.id, body);
  }

  @Put(':id')
  @UsePipes(new ZodValidationPipe(UpdateUsHoldingDto))
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.svc.update(req.user!.id, id, body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.svc.remove(req.user!.id, id);
  }
}
