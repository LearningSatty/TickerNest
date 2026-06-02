import {
  Body, Controller, Delete, Get, Param, Post, Put, Req, UsePipes,
} from '@nestjs/common';
import { ZodValidationPipe } from '@tickernest/common';
import type { Request } from 'express';
import { GoldService } from './gold.service';
import { CreateGoldDto, UpdateGoldDto, CreateSgbDto, UpdateSgbDto } from './gold.dto';

@Controller('gold')
export class GoldController {
  constructor(private readonly svc: GoldService) {}

  @Get()
  list(@Req() req: Request) {
    return this.svc.listGold(req.user!.id);
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.svc.getGold(req.user!.id, id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateGoldDto))
  create(@Req() req: Request, @Body() body: any) {
    return this.svc.createGold(req.user!.id, body);
  }

  @Put(':id')
  @UsePipes(new ZodValidationPipe(UpdateGoldDto))
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.svc.updateGold(req.user!.id, id, body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.svc.removeGold(req.user!.id, id);
  }
}

@Controller('sgb')
export class SgbController {
  constructor(private readonly svc: GoldService) {}

  @Get()
  list(@Req() req: Request) {
    return this.svc.listSgb(req.user!.id);
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    return this.svc.getSgb(req.user!.id, id);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(CreateSgbDto))
  create(@Req() req: Request, @Body() body: any) {
    return this.svc.createSgb(req.user!.id, body);
  }

  @Put(':id')
  @UsePipes(new ZodValidationPipe(UpdateSgbDto))
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.svc.updateSgb(req.user!.id, id, body);
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    return this.svc.removeSgb(req.user!.id, id);
  }
}
