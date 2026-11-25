import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { normalizeWorkspaceDraft, type WorkspaceDraftInput } from '@naqla/domain';
import { DbService } from '../infra/db.service';

/**
 * Phase B, package 4 — workspace drafts (SRS FR-U-025).
 *
 * The graduate's unsent work for one workspace is saved as they write, so a reload, a closed tab or a return the
 * next day loses nothing. A draft is private (RLS: owner only — the write runs as the user), it names only the
 * owner's own confirmed uploads (0038 guard), and it is NEVER evidence: no artifact, evidence item, evidence, claim or
 * progress event is written from it. The submission is still built from what the graduate sends when they submit,
 * and the submission removes the draft in the same transaction (SubmissionService).
 */
export interface DraftView {
  texts: Record<string, string>;
  files: Record<string, { uploadId: string; name: string; size: number | null }>;
  skillIds: string[];
  disclosure: Record<string, unknown>;
  revision: number;
  updatedAt: string;
}

@Injectable()
export class DraftService {
  constructor(private readonly db: DbService) {}

  /** The project's activity, its deliverables and skills, after the ownership check; and whether new work is allowed. */
  private async context(userId: string, projectId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new NotFoundException('project not found');
    return this.db.asService(async (c) => {
      const p = (await c.query('select id, user_id, activity_spec_id from project where id = $1 and deleted_at is null', [projectId])).rows[0];
      // Service role bypasses RLS, so ownership is checked here explicitly; another user's project is "not found".
      if (!p || p.user_id !== userId) throw new NotFoundException('project not found');
      if (!p.activity_spec_id) return { activityId: null, deliverables: [], skillIds: [], available: false };
      const deliverables = (await c.query('select key, format from activity_deliverable where activity_spec_id = $1', [p.activity_spec_id])).rows as { key: string; format: string }[];
      const skillIds = (await c.query('select skill_id from activity_skill where activity_spec_id = $1', [p.activity_spec_id])).rows.map((r) => String(r.skill_id));
      const goal = (await c.query('select target_role_id from career_goal where user_id = $1 and is_current', [userId])).rows[0];
      const available = goal ? (await c.query('select graduate_activity_in_catalogue($1, $2) as ok', [p.activity_spec_id, goal.target_role_id])).rows[0].ok === true : false;
      return { activityId: String(p.activity_spec_id), deliverables, skillIds, available };
    });
  }

  async get(userId: string, projectId: string): Promise<DraftView | null> {
    await this.context(userId, projectId);
    return this.db.asUser(userId, async (c) => {
      const d = (await c.query('select texts, files, skill_ids, disclosure, revision, updated_at from project_draft where project_id = $1', [projectId])).rows[0];
      if (!d) return null;
      const ids = Object.values(d.files as Record<string, string>);
      const meta = ids.length ? (await c.query('select id, declared_name, size_bytes from upload where id = any($1)', [ids])).rows : [];
      const files: DraftView['files'] = {};
      for (const [k, id] of Object.entries(d.files as Record<string, string>)) {
        const m = meta.find((x) => x.id === id);
        if (m) files[k] = { uploadId: id, name: String(m.declared_name), size: m.size_bytes === null ? null : Number(m.size_bytes) };
      }
      return { texts: d.texts, files, skillIds: d.skill_ids, disclosure: d.disclosure, revision: Number(d.revision), updatedAt: new Date(d.updated_at).toISOString() };
    });
  }

  /**
   * Saves the whole draft (last write wins within one revision). `revision` is the revision the client last saw:
   * when another tab saved in between, the save is refused (409) rather than silently overwriting newer work.
   */
  async save(userId: string, projectId: string, body: WorkspaceDraftInput & { revision?: number | null }): Promise<DraftView> {
    const ctx = await this.context(userId, projectId);
    if (!ctx.activityId) throw new ConflictException('[draft_not_supported] drafts are kept for activity workspaces only');
    if (!ctx.available) throw new ConflictException('[activity_unavailable] this activity is no longer in your catalogue; no new work is saved for it');
    const draft = normalizeWorkspaceDraft(body ?? {}, { deliverables: ctx.deliverables, skillIds: ctx.skillIds });
    await this.db.asUser(userId, async (c) => {
      const cur = (await c.query('select revision from project_draft where project_id = $1 for update', [projectId])).rows[0];
      const expected = body?.revision ?? null;
      if (cur && expected !== null && Number(cur.revision) !== Number(expected)) {
        throw new ConflictException('[draft_conflict] this work was saved from another window; reload to continue from the latest version');
      }
      if (!cur && expected !== null && expected !== undefined) {
        // The client believes a draft exists but it is gone (submitted or removed elsewhere): do not resurrect it silently.
        throw new ConflictException('[draft_conflict] this work was submitted or cleared from another window; reload to continue');
      }
      try {
        if (cur) {
          await c.query('update project_draft set texts = $2, files = $3, skill_ids = $4, disclosure = $5 where project_id = $1',
            [projectId, JSON.stringify(draft.texts), JSON.stringify(draft.files), JSON.stringify(draft.skillIds), JSON.stringify(draft.disclosure)]);
        } else {
          await c.query('insert into project_draft (project_id, user_id, texts, files, skill_ids, disclosure) values ($1, $2, $3, $4, $5, $6)',
            [projectId, userId, JSON.stringify(draft.texts), JSON.stringify(draft.files), JSON.stringify(draft.skillIds), JSON.stringify(draft.disclosure)]);
        }
      } catch (e) {
        // 0038 guard: a file that is not the owner's own confirmed submission upload.
        if ((e as { code?: string }).code === '23514') throw new ConflictException(`[draft_file_not_usable] ${(e as Error).message}`);
        throw e;
      }
    });
    return (await this.get(userId, projectId))!;
  }

  /** Clears the draft (the graduate's explicit "start over"). Their uploads stay theirs; nothing else changes. */
  async clear(userId: string, projectId: string): Promise<{ cleared: boolean }> {
    await this.context(userId, projectId);
    return this.db.asUser(userId, async (c) => ({ cleared: ((await c.query('delete from project_draft where project_id = $1', [projectId])).rowCount ?? 0) > 0 }));
  }
}
