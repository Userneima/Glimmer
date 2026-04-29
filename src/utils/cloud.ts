import type { PostgrestError } from '@supabase/supabase-js';
import { LONG_TERM_MASTER_ID, type Diary, type Folder, type Task, type LongTermIdea, type ExternalTaskLink, type TaskSourceContext } from '../types';
import { requireSupabase } from './supabase';
import type { AiSettings } from './storage';

/** Legacy long-term master diary id (non-UUID); must map before writing to uuid columns. */
const LEGACY_LONG_TERM_DIARY_ID = 'long-term-master';

function normalizeDiaryIdForCloud(id: string): string {
  if (id === LEGACY_LONG_TERM_DIARY_ID) return LONG_TERM_MASTER_ID;
  return id;
}

/** Loose UUID check (Postgres uuid text format). */
const UUID_TEXT_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuidText(value: string): boolean {
  return UUID_TEXT_RE.test(value.trim());
}

function isBlankHtmlContent(content: string | undefined | null): boolean {
  if (!content) return true;
  const text = content
    .replace(/<br\s*\/?>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text.length === 0;
}

/** PostgREST: ON CONFLICT target must match a unique index; composite PK needs user_id,id. */
function shouldRetryDiaryUpsertWithCompositePk(error: PostgrestError): boolean {
  const blob = `${error.message} ${error.details} ${error.hint}`.toLowerCase();
  if (blob.includes('row-level security') || blob.includes('jwt')) return false;
  return (
    blob.includes('no unique or exclusion constraint') ||
    blob.includes('there is no unique or exclusion constraint') ||
    (blob.includes('on conflict') && blob.includes('constraint'))
  );
}

type DiaryRow = {
  id: string;
  user_id: string;
  title?: string;
  content?: string;
  folder_id?: string | null;
  tags?: string[] | null;
  created_at: number | string;
  updated_at?: number | string | null;
};

// Convert DB timestamp (bigint ms or ISO string) to JS milliseconds
const toMs = (val: number | string | null | undefined, fallback: number): number => {
  if (!val) return fallback;
  if (typeof val === 'number') return val;
  const parsed = Date.parse(val);
  return isNaN(parsed) ? fallback : parsed;
};

type FolderRow = {
  id: string;
  user_id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  created_at: number | string;
};

type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  created_at: number | string;
  due_at: number | string | null;
  completed: boolean;
  recurring: string | null;
  related_diary_id: string | null;
  task_type: 'long-term' | 'time-range';
  start_date: number | string | null;
  end_date: number | string | null;
  completed_at: number | string | null;
  sort_order: number | null;
  tags?: string[] | null;
  external_links?: ExternalTaskLink[] | null;
  source_context?: TaskSourceContext | null;
};

type UserAiSettingsRow = {
  user_id: string;
  gemini_api_key: string | null;
  deepseek_key: string | null;
  deepseek_base_url: string | null;
  deepseek_model: string | null;
  updated_at?: string | null;
};

const toDiary = (row: DiaryRow): Diary => {
  const createdAt = toMs(row.created_at, Date.now());
  return {
    id: row.id,
    title: row.title ?? '',
    content: row.content ?? '',
    folderId: row.folder_id ?? null,
    tags: row.tags ?? [],
    createdAt,
    updatedAt: toMs(row.updated_at, createdAt),
  };
};

const toDiaryRow = (userId: string, diary: Diary): DiaryRow => {
  const now = Date.now();
  const createdAt = Number.isFinite(diary.createdAt) ? Math.trunc(diary.createdAt) : now;
  const updatedAt = Number.isFinite(diary.updatedAt) ? Math.trunc(diary.updatedAt) : createdAt;
  const rawFolder = diary.folderId;
  let folder_id: string | null = null;
  if (rawFolder != null && String(rawFolder).trim() !== '') {
    const f = String(rawFolder).trim();
    folder_id = isUuidText(f) ? f : null;
  }

  return {
    id: normalizeDiaryIdForCloud(diary.id),
    user_id: userId,
    title: diary.title ?? '',
    content: diary.content ?? '',
    folder_id,
    tags: Array.isArray(diary.tags) ? diary.tags : [],
    created_at: createdAt,
    updated_at: updatedAt,
  };
};

const toFolder = (row: FolderRow): Folder => {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    color: row.color ?? undefined,
    createdAt: toMs(row.created_at, Date.now()),
  };
};

const toFolderRow = (userId: string, folder: Folder): FolderRow => {
  return {
    id: folder.id,
    user_id: userId,
    name: folder.name,
    parent_id: folder.parentId,
    color: folder.color ?? null,
    created_at: folder.createdAt,
  };
};

const toTask = (row: TaskRow): Task => {
  const createdAt = toMs(row.created_at, Date.now());
  return {
    id: row.id,
    title: row.title,
    notes: row.notes ?? undefined,
    createdAt,
    dueAt: row.due_at ? toMs(row.due_at, createdAt) : null,
    completed: row.completed,
    recurring: row.recurring,
    relatedDiaryId: row.related_diary_id,
    taskType: row.task_type,
    startDate: row.start_date ? toMs(row.start_date, createdAt) : null,
    endDate: row.end_date ? toMs(row.end_date, createdAt) : null,
    completedAt: row.completed_at ? toMs(row.completed_at, createdAt) : null,
    order: row.sort_order ?? undefined,
    tags: row.tags ?? [],
    externalLinks: row.external_links ?? [],
    sourceContext: row.source_context ?? { kind: 'manual' },
  };
};

const toTaskRow = (userId: string, task: Task, includeExternalFields = true): TaskRow => {
  const row: TaskRow = {
    id: task.id,
    user_id: userId,
    title: task.title,
    notes: task.notes ?? null,
    created_at: task.createdAt,
    due_at: task.dueAt ?? null,
    completed: task.completed,
    recurring: task.recurring ?? null,
    related_diary_id: task.relatedDiaryId ?? null,
    task_type: task.taskType,
    start_date: task.startDate ?? null,
    end_date: task.endDate ?? null,
    completed_at: task.completedAt ?? null,
    sort_order: task.order ?? null,
    tags: task.tags.length > 0 ? task.tags : null,
  };
  if (includeExternalFields) {
    row.external_links = task.externalLinks && task.externalLinks.length > 0 ? task.externalLinks : null;
    row.source_context = task.sourceContext ?? { kind: 'manual' };
  }
  return row;
};

const toAiSettings = (row: UserAiSettingsRow | null): AiSettings => {
  if (!row) return {};
  return {
    geminiApiKey: row.gemini_api_key,
    deepseekKey: row.deepseek_key,
    deepseekBaseUrl: row.deepseek_base_url,
    deepseekModel: row.deepseek_model,
  };
};

const toAiSettingsRow = (userId: string, settings: AiSettings): UserAiSettingsRow => ({
  user_id: userId,
  gemini_api_key: settings.geminiApiKey ?? null,
  deepseek_key: settings.deepseekKey ?? null,
  deepseek_base_url: settings.deepseekBaseUrl ?? null,
  deepseek_model: settings.deepseekModel ?? null,
});

export const cloud = {
  async fetchAiSettings(userId: string): Promise<AiSettings | null> {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('user_ai_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      const blob = `${error.message} ${error.details} ${error.hint}`.toLowerCase();
      if (
        error.code === '42P01' ||
        error.code === 'PGRST116' ||
        blob.includes('user_ai_settings') ||
        blob.includes('does not exist')
      ) {
        return null;
      }
      throw error;
    }

    return toAiSettings((data as UserAiSettingsRow | null) ?? null);
  },

  async upsertAiSettings(userId: string, settings: AiSettings): Promise<void> {
    const supabase = requireSupabase();
    const row = toAiSettingsRow(userId, settings);
    const { error } = await supabase.from('user_ai_settings').upsert(row, { onConflict: 'user_id' });
    if (error) throw error;
  },

  async fetchDiaries(userId: string): Promise<Diary[]> {
    const supabase = requireSupabase();
    // Try ordering by updated_at; fall back to created_at if column missing
    const first = await supabase
      .from('diaries')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (!first.error) {
      return (first.data as DiaryRow[] | null)?.map(toDiary) ?? [];
    }

    // 42703 = column does not exist
    if (first.error.code === '42703') {
      const fallback = await supabase
        .from('diaries')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      // If still failing (e.g. table schema severely broken), return [] to protect local data
      if (fallback.error) return [];
      return (fallback.data as DiaryRow[] | null)?.map(toDiary) ?? [];
    }

    // Any other error (table missing, network, etc.) — return [] to protect local data
    return [];
  },

  async insertDiary(userId: string, diary: Diary): Promise<void> {
    const supabase = requireSupabase();
    const row = toDiaryRow(userId, diary);
    const { error } = await supabase
      .from('diaries')
      .insert(row);

    if (error) throw error;
  },

  async upsertDiary(userId: string, diary: Diary): Promise<void> {
    const supabase = requireSupabase();
    const idForCloud = normalizeDiaryIdForCloud(diary.id);
    if (!isUuidText(idForCloud)) {
      console.warn('[cloud] Skip sync: diary id is not a valid UUID', diary.id);
      return;
    }
    const row = toDiaryRow(userId, diary);
    if (idForCloud === LONG_TERM_MASTER_ID && isBlankHtmlContent(row.content)) {
      const existing = await supabase
        .from('diaries')
        .select('content')
        .eq('id', idForCloud)
        .eq('user_id', userId)
        .maybeSingle();

      if (!existing.error && existing.data && !isBlankHtmlContent((existing.data as Pick<DiaryRow, 'content'>).content)) {
        console.warn('[cloud] Skip blank overwrite for Long-term Master diary');
        return;
      }
    }

    let { error } = await supabase.from('diaries').upsert(row, { onConflict: 'id' });

    if (error && shouldRetryDiaryUpsertWithCompositePk(error)) {
      ({ error } = await supabase.from('diaries').upsert(row, { onConflict: 'user_id,id' }));
    }

    if (error) throw error;
  },

  async deleteDiary(userId: string, diaryId: string): Promise<void> {
    const supabase = requireSupabase();
    const idForCloud = normalizeDiaryIdForCloud(diaryId);
    const { error } = await supabase
      .from('diaries')
      .delete()
      .eq('id', idForCloud)
      .eq('user_id', userId);

    if (error) throw error;
  },

  async fetchFolders(userId: string): Promise<Folder[]> {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('folders')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data as FolderRow[] | null)?.map(toFolder) ?? [];
  },

  async upsertFolder(userId: string, folder: Folder): Promise<void> {
    const supabase = requireSupabase();
    const row = toFolderRow(userId, folder);
    const { error } = await supabase
      .from('folders')
      .upsert(row, { onConflict: 'id' });

    if (error) throw error;
  },

  async deleteFolder(userId: string, folderId: string): Promise<void> {
    const supabase = requireSupabase();
    const { error } = await supabase
      .from('folders')
      .delete()
      .eq('id', folderId)
      .eq('user_id', userId);

    if (error) throw error;

    const { error: diaryError } = await supabase
      .from('diaries')
      .update({ folder_id: null })
      .eq('user_id', userId)
      .eq('folder_id', folderId);

    if (diaryError) throw diaryError;
  },

  async fetchTasks(userId: string): Promise<Task[]> {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (error) {
      // 42703 = column does not exist (tags column not yet added to schema)
      if (error.code === '42703') {
        // Return empty array to let local data take precedence
        return [];
      }
      throw error;
    }
    return (data as TaskRow[] | null)?.map(toTask) ?? [];
  },

  async upsertTask(userId: string, task: Task): Promise<void> {
    const supabase = requireSupabase();
    const row = toTaskRow(userId, task);
    const { error } = await supabase
      .from('tasks')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      // 42703 = column does not exist (tags column not yet added to schema)
      if (error.code === '42703') {
        const legacyRow = toTaskRow(userId, task, false);
        const { error: legacyError } = await supabase
          .from('tasks')
          .upsert(legacyRow, { onConflict: 'id' });
        if (!legacyError || legacyError.code === '42703') {
          return;
        }
        throw legacyError;
      }
      throw error;
    }
  },

  async deleteTask(userId: string, taskId: string): Promise<void> {
    const supabase = requireSupabase();
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId)
      .eq('user_id', userId);

    if (error) throw error;
  },

  // Long Term Ideas
  async fetchLongTermIdeas(userId: string): Promise<LongTermIdea[]> {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('long_term_ideas')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      if (error.code === '42703') {
        return [];
      }
      throw error;
    }
    return (data as any[] | null)?.map(toLongTermIdea) ?? [];
  },

  async upsertLongTermIdea(userId: string, idea: LongTermIdea): Promise<void> {
    const supabase = requireSupabase();
    const row = toLongTermIdeaRow(userId, idea);
    const { error } = await supabase
      .from('long_term_ideas')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      if (error.code === '42703') {
        return;
      }
      throw error;
    }
  },

  async deleteLongTermIdea(userId: string, ideaId: string): Promise<void> {
    const supabase = requireSupabase();
    const { error } = await supabase
      .from('long_term_ideas')
      .delete()
      .eq('id', ideaId)
      .eq('user_id', userId);

    if (error) throw error;
  },
};

type LongTermIdeaRow = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  original_diary_id: string;
  original_position: { from: number; to: number } | null;
  progress: string;
  note: string | null;
  reminder: { type: 'periodic' | 'deadline'; value: string } | null;
  last_accessed_at: number | string | null;
  last_edited_at: number | string | null;
  created_at: number | string;
  versions: any[];
  original_deleted: boolean;
};

const toLongTermIdea = (row: LongTermIdeaRow): LongTermIdea => {
  const createdAt = toMs(row.created_at, Date.now());
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    originalDiaryId: row.original_diary_id,
    originalPosition: row.original_position ?? undefined,
    progress: row.progress as any,
    note: row.note ?? undefined,
    reminder: row.reminder ?? undefined,
    lastAccessedAt: row.last_accessed_at ? toMs(row.last_accessed_at, createdAt) : undefined,
    lastEditedAt: row.last_edited_at ? toMs(row.last_edited_at, createdAt) : undefined,
    createdAt,
    versions: row.versions ?? [],
    originalDeleted: row.original_deleted ?? false,
  };
};

const toLongTermIdeaRow = (userId: string, idea: LongTermIdea): LongTermIdeaRow => {
  return {
    id: idea.id,
    user_id: userId,
    title: idea.title,
    content: idea.content,
    original_diary_id: idea.originalDiaryId,
    original_position: idea.originalPosition ?? null,
    progress: idea.progress,
    note: idea.note ?? null,
    reminder: idea.reminder ?? null,
    last_accessed_at: idea.lastAccessedAt ?? null,
    last_edited_at: idea.lastEditedAt ?? null,
    created_at: idea.createdAt,
    versions: idea.versions,
    original_deleted: idea.originalDeleted ?? false,
  };
};
