import { Injectable } from '@nestjs/common';
import { DbService } from '../common/db.service';

export interface NoteRow {
  id: string;
  user_id: string;
  folder_id: string | null;
  title: string;
  content: string;
  content_html: string;
  is_done: boolean;
  is_pinned: boolean;
  tags: string[];
  has_checklist: boolean;
  has_table: boolean;
  has_image: boolean;
  created_at: string;
  updated_at: string;
}

export interface FolderRow {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  note_count?: number;
}

export interface AttachmentRow {
  id: string;
  user_id: string;
  note_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  url: string;
  created_at: string;
}

const NOTE_COLS = `id, user_id, folder_id, title, content, content_html, is_done, is_pinned, tags, has_checklist, has_table, has_image, created_at, updated_at`;
const FOLDER_COLS = `id, user_id, name, parent_id, sort_order, created_at, updated_at`;

@Injectable()
export class NotesService {
  constructor(private readonly db: DbService) {}

  // ─── Notes CRUD ────────────────────────────────────────────────────────────

  async list(userId: string, folderId?: string | null, search?: string): Promise<NoteRow[]> {
    return this.db.withUserTx(userId, async (tx) => {
      let sql = `SELECT ${NOTE_COLS} FROM note WHERE user_id = $1`;
      const params: unknown[] = [userId];
      let idx = 2;

      if (folderId === 'unfiled') {
        sql += ` AND folder_id IS NULL`;
      } else if (folderId) {
        sql += ` AND folder_id = $${idx++}`;
        params.push(folderId);
      }

      if (search) {
        sql += ` AND (title ILIKE $${idx} OR content ILIKE $${idx})`;
        params.push(`%${search}%`);
        idx++;
      }

      sql += ` ORDER BY is_pinned DESC, updated_at DESC`;

      const { rows } = await tx.query<NoteRow>(sql, params);
      return rows;
    });
  }

  async getOne(userId: string, noteId: string): Promise<NoteRow | null> {
    return this.db.withUserTx(userId, async (tx) => {
      const { rows } = await tx.query<NoteRow>(
        `SELECT ${NOTE_COLS} FROM note WHERE id = $1 AND user_id = $2`,
        [noteId, userId],
      );
      return rows[0] ?? null;
    });
  }

  async create(userId: string, data: {
    title: string;
    content?: string;
    content_html?: string;
    folder_id?: string | null;
    tags?: string[];
    is_pinned?: boolean;
    has_checklist?: boolean;
    has_table?: boolean;
    has_image?: boolean;
  }): Promise<NoteRow> {
    return this.db.withUserTx(userId, async (tx) => {
      const { rows } = await tx.query<NoteRow>(
        `INSERT INTO note (user_id, title, content, content_html, folder_id, tags, is_pinned, has_checklist, has_table, has_image)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING ${NOTE_COLS}`,
        [
          userId,
          data.title,
          data.content ?? '',
          data.content_html ?? '',
          data.folder_id ?? null,
          data.tags ?? [],
          data.is_pinned ?? false,
          data.has_checklist ?? false,
          data.has_table ?? false,
          data.has_image ?? false,
        ],
      );
      return rows[0]!;
    });
  }

  async update(userId: string, noteId: string, data: {
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
  }): Promise<NoteRow> {
    return this.db.withUserTx(userId, async (tx) => {
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (data.title !== undefined) { sets.push(`title = $${idx++}`); params.push(data.title); }
      if (data.content !== undefined) { sets.push(`content = $${idx++}`); params.push(data.content); }
      if (data.content_html !== undefined) { sets.push(`content_html = $${idx++}`); params.push(data.content_html); }
      if (data.folder_id !== undefined) { sets.push(`folder_id = $${idx++}`); params.push(data.folder_id); }
      if (data.is_done !== undefined) { sets.push(`is_done = $${idx++}`); params.push(data.is_done); }
      if (data.is_pinned !== undefined) { sets.push(`is_pinned = $${idx++}`); params.push(data.is_pinned); }
      if (data.tags !== undefined) { sets.push(`tags = $${idx++}`); params.push(data.tags); }
      if (data.has_checklist !== undefined) { sets.push(`has_checklist = $${idx++}`); params.push(data.has_checklist); }
      if (data.has_table !== undefined) { sets.push(`has_table = $${idx++}`); params.push(data.has_table); }
      if (data.has_image !== undefined) { sets.push(`has_image = $${idx++}`); params.push(data.has_image); }

      if (sets.length === 0) {
        return (await this.getOne(userId, noteId))!;
      }

      params.push(noteId);
      params.push(userId);
      const { rows } = await tx.query<NoteRow>(
        `UPDATE note SET ${sets.join(', ')}
         WHERE id = $${idx++} AND user_id = $${idx}
         RETURNING ${NOTE_COLS}`,
        params,
      );
      return rows[0]!;
    });
  }

  async togglePin(userId: string, noteId: string): Promise<NoteRow> {
    return this.db.withUserTx(userId, async (tx) => {
      const { rows } = await tx.query<NoteRow>(
        `UPDATE note SET is_pinned = NOT is_pinned
         WHERE id = $1 AND user_id = $2
         RETURNING ${NOTE_COLS}`,
        [noteId, userId],
      );
      return rows[0]!;
    });
  }

  async toggleDone(userId: string, noteId: string): Promise<NoteRow> {
    return this.db.withUserTx(userId, async (tx) => {
      const { rows } = await tx.query<NoteRow>(
        `UPDATE note SET is_done = NOT is_done
         WHERE id = $1 AND user_id = $2
         RETURNING ${NOTE_COLS}`,
        [noteId, userId],
      );
      return rows[0]!;
    });
  }

  async moveToFolder(userId: string, noteId: string, folderId: string | null): Promise<NoteRow> {
    return this.db.withUserTx(userId, async (tx) => {
      const { rows } = await tx.query<NoteRow>(
        `UPDATE note SET folder_id = $1 WHERE id = $2 AND user_id = $3 RETURNING ${NOTE_COLS}`,
        [folderId, noteId, userId],
      );
      return rows[0]!;
    });
  }

  async remove(userId: string, noteId: string): Promise<void> {
    await this.db.withUserTx(userId, async (tx) => {
      await tx.query(`DELETE FROM note WHERE id = $1 AND user_id = $2`, [noteId, userId]);
    });
  }

  // ─── Folders CRUD ──────────────────────────────────────────────────────────

  async listFolders(userId: string): Promise<FolderRow[]> {
    return this.db.withUserTx(userId, async (tx) => {
      const cols = FOLDER_COLS.split(', ').map((c) => `f.${c}`).join(', ');
      const { rows } = await tx.query<FolderRow>(
        `SELECT ${cols},
                COUNT(n.id)::int as note_count
         FROM note_folder f
         LEFT JOIN note n ON n.folder_id = f.id
         WHERE f.user_id = $1
         GROUP BY f.id
         ORDER BY f.sort_order, f.name`,
        [userId],
      );
      return rows;
    });
  }

  async createFolder(userId: string, name: string, parentId?: string | null): Promise<FolderRow> {
    return this.db.withUserTx(userId, async (tx) => {
      const { rows } = await tx.query<FolderRow>(
        `INSERT INTO note_folder (user_id, name, parent_id)
         VALUES ($1, $2, $3)
         RETURNING ${FOLDER_COLS}`,
        [userId, name, parentId ?? null],
      );
      return rows[0]!;
    });
  }

  async renameFolder(userId: string, folderId: string, name: string): Promise<FolderRow> {
    return this.db.withUserTx(userId, async (tx) => {
      const { rows } = await tx.query<FolderRow>(
        `UPDATE note_folder SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING ${FOLDER_COLS}`,
        [name, folderId, userId],
      );
      return rows[0]!;
    });
  }

  async deleteFolder(userId: string, folderId: string): Promise<void> {
    await this.db.withUserTx(userId, async (tx) => {
      // Move notes in this folder to unfiled
      await tx.query(
        `UPDATE note SET folder_id = NULL WHERE folder_id = $1 AND user_id = $2`,
        [folderId, userId],
      );
      await tx.query(
        `DELETE FROM note_folder WHERE id = $1 AND user_id = $2`,
        [folderId, userId],
      );
    });
  }

  // ─── Attachments ───────────────────────────────────────────────────────────

  async addAttachment(userId: string, noteId: string, data: {
    filename: string;
    mime_type: string;
    size_bytes: number;
    url: string;
  }): Promise<AttachmentRow> {
    return this.db.withUserTx(userId, async (tx) => {
      const { rows } = await tx.query<AttachmentRow>(
        `INSERT INTO note_attachment (user_id, note_id, filename, mime_type, size_bytes, url)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, user_id, note_id, filename, mime_type, size_bytes, url, created_at`,
        [userId, noteId, data.filename, data.mime_type, data.size_bytes, data.url],
      );
      // Mark note as having image
      await tx.query(
        `UPDATE note SET has_image = true WHERE id = $1 AND user_id = $2`,
        [noteId, userId],
      );
      return rows[0]!;
    });
  }

  async listAttachments(userId: string, noteId: string): Promise<AttachmentRow[]> {
    return this.db.withUserTx(userId, async (tx) => {
      const { rows } = await tx.query<AttachmentRow>(
        `SELECT id, user_id, note_id, filename, mime_type, size_bytes, url, created_at
         FROM note_attachment WHERE note_id = $1 AND user_id = $2
         ORDER BY created_at DESC`,
        [noteId, userId],
      );
      return rows;
    });
  }

  async deleteAttachment(userId: string, attachmentId: string): Promise<void> {
    await this.db.withUserTx(userId, async (tx) => {
      await tx.query(
        `DELETE FROM note_attachment WHERE id = $1 AND user_id = $2`,
        [attachmentId, userId],
      );
    });
  }
}
