import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { NotesService } from './notes.service';

@Controller('notes')
export class NotesController {
  constructor(private readonly svc: NotesService) {}

  // ─── Folders (MUST be before :id routes to avoid conflict) ─────────────────

  @Get('folders/list')
  async listFolders(@Req() req: { user?: { id: string } }) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.listFolders(req.user.id);
  }

  @Post('folders')
  async createFolder(
    @Req() req: { user?: { id: string } },
    @Body() body: { name: string; parent_id?: string | null },
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.createFolder(req.user.id, body.name, body.parent_id);
  }

  @Patch('folders/:id')
  async renameFolder(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
    @Body() body: { name: string },
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.renameFolder(req.user.id, id, body.name);
  }

  @Delete('folders/:id')
  async deleteFolder(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.deleteFolder(req.user.id, id);
  }

  // ─── Attachments (before :id to avoid conflict) ────────────────────────────

  @Delete('attachments/:attachmentId')
  async deleteAttachment(
    @Req() req: { user?: { id: string } },
    @Param('attachmentId') attachmentId: string,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.deleteAttachment(req.user.id, attachmentId);
  }

  // ─── Notes ─────────────────────────────────────────────────────────────────

  @Get()
  async list(
    @Req() req: { user?: { id: string } },
    @Query('folder_id') folderId?: string,
    @Query('search') search?: string,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.list(req.user.id, folderId || undefined, search || undefined);
  }

  @Post()
  async create(
    @Req() req: { user?: { id: string } },
    @Body() body: {
      title: string;
      content?: string;
      content_html?: string;
      folder_id?: string | null;
      tags?: string[];
      is_pinned?: boolean;
      has_checklist?: boolean;
      has_table?: boolean;
      has_image?: boolean;
    },
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.create(req.user.id, body);
  }

  @Get(':id')
  async getOne(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.getOne(req.user.id, id);
  }

  @Patch(':id')
  async update(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
    @Body() body: {
      title?: string;
      content?: string;
      content_html?: string;
      folder_id?: string | null;
      is_done?: boolean;
      is_pinned?: boolean;
      tags?: string[];
      has_checklist?: boolean;
      has_table?: boolean;
      has_image?: boolean;
    },
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.update(req.user.id, id, body);
  }

  @Patch(':id/pin')
  async togglePin(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.togglePin(req.user.id, id);
  }

  @Patch(':id/toggle')
  async toggleDone(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.toggleDone(req.user.id, id);
  }

  @Patch(':id/move')
  async moveToFolder(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
    @Body() body: { folder_id: string | null },
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.moveToFolder(req.user.id, id, body.folder_id);
  }

  @Delete(':id')
  async remove(
    @Req() req: { user?: { id: string } },
    @Param('id') id: string,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.remove(req.user.id, id);
  }

  @Post(':noteId/attachments')
  async addAttachment(
    @Req() req: { user?: { id: string } },
    @Param('noteId') noteId: string,
    @Body() body: { filename: string; mime_type: string; size_bytes: number; url: string },
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.addAttachment(req.user.id, noteId, body);
  }

  @Get(':noteId/attachments')
  async listAttachments(
    @Req() req: { user?: { id: string } },
    @Param('noteId') noteId: string,
  ) {
    if (!req.user) throw new UnauthorizedException();
    return this.svc.listAttachments(req.user.id, noteId);
  }
}
