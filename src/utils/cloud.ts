import type { PostgrestError } from '@supabase/supabase-js';
import { LONG_TERM_MASTER_ID, type Diary, type Folder, type Task, type LongTermIdea, type ExternalTaskLink, type TaskSourceContext, type AppleReminder, type DiaryInsight, type ReviewDigest } from '../types';
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

function shouldRetryDiaryUpsertWithoutTaskDocumentFields(error: PostgrestError): boolean {
  const blob = `${error.code ?? ''} ${error.message} ${error.details} ${error.hint}`.toLowerCase();
  return error.code === '42703' || blob.includes('task_document');
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
  is_task_document?: boolean | null;
  task_document_source_diary_id?: string | null;
  task_document_source_task_title?: string | null;
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

type AppleReminderRow = {
  user_id: string;
  external_id: string;
  title: string;
  notes: string | null;
  due_at: number | string | null;
  completed: boolean;
  calendar_id: string | null;
  calendar_title: string | null;
  priority: number | null;
  fetched_at: number | string;
  updated_at: number | string;
};

type DiaryInsightRow = {
  id: string;
  user_id: string;
  diary_id: string;
  date: number | string;
  content_hash: string;
  summary: string;
  important_events: DiaryInsight['importantEvents'];
  domains: DiaryInsight['domains'];
  people: string[];
  places: string[];
  health_signals: DiaryInsight['healthSignals'];
  course_signals: DiaryInsight['courseSignals'];
  work_signals: DiaryInsight['workSignals'];
  interview_signals: DiaryInsight['interviewSignals'];
  relationship_signals: DiaryInsight['relationshipSignals'];
  absence_candidates: DiaryInsight['absenceCandidates'];
  confirmed_item_ids: string[];
  dismissed_item_ids: string[];
  status: DiaryInsight['status'];
  source: DiaryInsight['source'];
  created_at: number | string;
  updated_at: number | string;
};

type ReviewDigestRow = {
  id: string;
  user_id: string;
  period_type: ReviewDigest['periodType'];
  start_date: number | string;
  end_date: number | string;
  source_diary_ids: string[];
  summary: string;
  highlights: string[];
  patterns: string[];
  risks: string[];
  unresolved_questions: string[];
  suggested_tags: string[];
  confirmed_at: number | string | null;
  created_at: number | string;
  updated_at: number | string;
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
    isTaskDocument: row.is_task_document ?? undefined,
    taskDocumentSourceDiaryId: row.task_document_source_diary_id ?? undefined,
    taskDocumentSourceTaskTitle: row.task_document_source_task_title ?? undefined,
  };
};

const toDiaryRow = (userId: string, diary: Diary, includeTaskDocumentFields = true): DiaryRow => {
  const now = Date.now();
  const createdAt = Number.isFinite(diary.createdAt) ? Math.trunc(diary.createdAt) : now;
  const updatedAt = Number.isFinite(diary.updatedAt) ? Math.trunc(diary.updatedAt) : createdAt;
  const rawFolder = diary.folderId;
  let folder_id: string | null = null;
  if (rawFolder != null && String(rawFolder).trim() !== '') {
    const f = String(rawFolder).trim();
    folder_id = isUuidText(f) ? f : null;
  }

  const row: DiaryRow = {
    id: normalizeDiaryIdForCloud(diary.id),
    user_id: userId,
    title: diary.title ?? '',
    content: diary.content ?? '',
    folder_id,
    tags: Array.isArray(diary.tags) ? diary.tags : [],
    created_at: createdAt,
    updated_at: updatedAt,
  };

  if (includeTaskDocumentFields) {
    row.is_task_document = Boolean(diary.isTaskDocument);
    row.task_document_source_diary_id = diary.taskDocumentSourceDiaryId && isUuidText(diary.taskDocumentSourceDiaryId)
      ? diary.taskDocumentSourceDiaryId
      : null;
    row.task_document_source_task_title = diary.taskDocumentSourceTaskTitle ?? null;
  }

  return row;
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
  };
  if (includeExternalFields) {
    row.tags = task.tags.length > 0 ? task.tags : null;
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

const toDiaryInsight = (row: DiaryInsightRow): DiaryInsight => {
  const createdAt = toMs(row.created_at, Date.now());
  return {
    id: row.id,
    diaryId: row.diary_id,
    date: toMs(row.date, createdAt),
    contentHash: row.content_hash,
    summary: row.summary,
    importantEvents: row.important_events ?? [],
    domains: row.domains ?? [],
    people: row.people ?? [],
    places: row.places ?? [],
    healthSignals: row.health_signals ?? [],
    courseSignals: row.course_signals ?? [],
    workSignals: row.work_signals ?? [],
    interviewSignals: row.interview_signals ?? [],
    relationshipSignals: row.relationship_signals ?? [],
    absenceCandidates: row.absence_candidates ?? [],
    confirmedItemIds: row.confirmed_item_ids ?? [],
    dismissedItemIds: row.dismissed_item_ids ?? [],
    status: row.status ?? 'pending',
    source: row.source ?? 'local',
    createdAt,
    updatedAt: toMs(row.updated_at, createdAt),
  };
};

const toDiaryInsightRow = (userId: string, insight: DiaryInsight): DiaryInsightRow => ({
  id: insight.id,
  user_id: userId,
  diary_id: normalizeDiaryIdForCloud(insight.diaryId),
  date: insight.date,
  content_hash: insight.contentHash,
  summary: insight.summary,
  important_events: insight.importantEvents,
  domains: insight.domains,
  people: insight.people,
  places: insight.places,
  health_signals: insight.healthSignals,
  course_signals: insight.courseSignals,
  work_signals: insight.workSignals,
  interview_signals: insight.interviewSignals,
  relationship_signals: insight.relationshipSignals,
  absence_candidates: insight.absenceCandidates,
  confirmed_item_ids: insight.confirmedItemIds,
  dismissed_item_ids: insight.dismissedItemIds,
  status: insight.status,
  source: insight.source,
  created_at: insight.createdAt,
  updated_at: insight.updatedAt,
});

const toReviewDigest = (row: ReviewDigestRow): ReviewDigest => {
  const createdAt = toMs(row.created_at, Date.now());
  return {
    id: row.id,
    periodType: row.period_type,
    startDate: toMs(row.start_date, createdAt),
    endDate: toMs(row.end_date, createdAt),
    sourceDiaryIds: row.source_diary_ids ?? [],
    summary: row.summary,
    highlights: row.highlights ?? [],
    patterns: row.patterns ?? [],
    risks: row.risks ?? [],
    unresolvedQuestions: row.unresolved_questions ?? [],
    suggestedTags: row.suggested_tags ?? [],
    confirmedAt: row.confirmed_at ? toMs(row.confirmed_at, createdAt) : undefined,
    createdAt,
    updatedAt: toMs(row.updated_at, createdAt),
  };
};

const toReviewDigestRow = (userId: string, digest: ReviewDigest): ReviewDigestRow => ({
  id: digest.id,
  user_id: userId,
  period_type: digest.periodType,
  start_date: digest.startDate,
  end_date: digest.endDate,
  source_diary_ids: digest.sourceDiaryIds.map(normalizeDiaryIdForCloud).filter(isUuidText),
  summary: digest.summary,
  highlights: digest.highlights,
  patterns: digest.patterns,
  risks: digest.risks,
  unresolved_questions: digest.unresolvedQuestions,
  suggested_tags: digest.suggestedTags,
  confirmed_at: digest.confirmedAt ?? null,
  created_at: digest.createdAt,
  updated_at: digest.updatedAt,
});

const isMissingCloudTableError = (error: PostgrestError): boolean => {
  const blob = `${error.message} ${error.details} ${error.hint}`.toLowerCase();
  return (
    error.code === '42P01' ||
    error.code === 'PGRST116' ||
    blob.includes('does not exist') ||
    blob.includes('not found')
  );
};

const toAppleReminder = (row: AppleReminderRow): AppleReminder => ({
  externalId: row.external_id,
  title: row.title,
  notes: row.notes ?? undefined,
  dueAt: row.due_at ? toMs(row.due_at, Date.now()) : null,
  completed: row.completed,
  calendarId: row.calendar_id ?? undefined,
  calendarTitle: row.calendar_title ?? undefined,
  priority: row.priority ?? undefined,
});

const toAppleReminderRow = (
  userId: string,
  reminder: AppleReminder,
  fetchedAt: number,
): AppleReminderRow => ({
  user_id: userId,
  external_id: reminder.externalId,
  title: reminder.title,
  notes: reminder.notes ?? null,
  due_at: reminder.dueAt ?? null,
  completed: reminder.completed,
  calendar_id: reminder.calendarId ?? null,
  calendar_title: reminder.calendarTitle ?? null,
  priority: reminder.priority ?? null,
  fetched_at: fetchedAt,
  updated_at: Date.now(),
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

    return data ? toAiSettings(data as UserAiSettingsRow) : null;
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
    let { error } = await supabase
      .from('diaries')
      .insert(row);

    if (error && shouldRetryDiaryUpsertWithoutTaskDocumentFields(error)) {
      const legacyRow = toDiaryRow(userId, diary, false);
      ({ error } = await supabase
        .from('diaries')
        .insert(legacyRow));
    }

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

    if (error && shouldRetryDiaryUpsertWithoutTaskDocumentFields(error)) {
      const legacyRow = toDiaryRow(userId, diary, false);
      ({ error } = await supabase.from('diaries').upsert(legacyRow, { onConflict: 'id' }));

      if (error && shouldRetryDiaryUpsertWithCompositePk(error)) {
        ({ error } = await supabase.from('diaries').upsert(legacyRow, { onConflict: 'user_id,id' }));
      }
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

  async fetchDiaryInsights(userId: string): Promise<DiaryInsight[]> {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('diary_insights')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      if (isMissingCloudTableError(error)) return [];
      throw error;
    }

    return (data as DiaryInsightRow[] | null)?.map(toDiaryInsight) ?? [];
  },

  async upsertDiaryInsight(userId: string, insight: DiaryInsight): Promise<void> {
    const supabase = requireSupabase();
    const row = toDiaryInsightRow(userId, insight);
    if (!isUuidText(row.diary_id)) return;
    const { error } = await supabase
      .from('diary_insights')
      .upsert(row, { onConflict: 'user_id,diary_id' });

    if (error) {
      if (isMissingCloudTableError(error)) return;
      throw error;
    }
  },

  async fetchReviewDigests(userId: string): Promise<ReviewDigest[]> {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('review_digests')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      if (isMissingCloudTableError(error)) return [];
      throw error;
    }

    return (data as ReviewDigestRow[] | null)?.map(toReviewDigest) ?? [];
  },

  async upsertReviewDigest(userId: string, digest: ReviewDigest): Promise<void> {
    const supabase = requireSupabase();
    const row = toReviewDigestRow(userId, digest);
    const { error } = await supabase
      .from('review_digests')
      .upsert(row, { onConflict: 'user_id,period_type,start_date,end_date' });

    if (error) {
      if (isMissingCloudTableError(error)) return;
      throw error;
    }
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

  async fetchAppleReminders(userId: string): Promise<AppleReminder[]> {
    const supabase = requireSupabase();
    const { data, error } = await supabase
      .from('apple_reminders')
      .select('*')
      .eq('user_id', userId)
      .eq('completed', false)
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('title', { ascending: true });

    if (error) {
      if (isMissingCloudTableError(error)) {
        throw new Error('Apple Reminders cloud table is not configured. Run docs/supabase/apple-reminders.sql in Supabase.');
      }
      throw error;
    }

    return (data as AppleReminderRow[] | null)?.map(toAppleReminder) ?? [];
  },

  async replaceAppleReminders(userId: string, reminders: AppleReminder[]): Promise<void> {
    const supabase = requireSupabase();
    const fetchedAt = Date.now();

    if (reminders.length === 0) {
      const { error } = await supabase
        .from('apple_reminders')
        .delete()
        .eq('user_id', userId);

      if (error) {
        if (isMissingCloudTableError(error)) {
          throw new Error('Apple Reminders cloud table is not configured. Run docs/supabase/apple-reminders.sql in Supabase.');
        }
        throw error;
      }
      return;
    }

    const rows = reminders.map((reminder) => toAppleReminderRow(userId, reminder, fetchedAt));
    let { error } = await supabase
      .from('apple_reminders')
      .upsert(rows, { onConflict: 'user_id,external_id' });

    if (error) {
      if (isMissingCloudTableError(error)) {
        throw new Error('Apple Reminders cloud table is not configured. Run docs/supabase/apple-reminders.sql in Supabase.');
      }
      throw error;
    }

    ({ error } = await supabase
      .from('apple_reminders')
      .delete()
      .eq('user_id', userId)
      .lt('fetched_at', fetchedAt));

    if (error && !isMissingCloudTableError(error)) throw error;
    if (error && isMissingCloudTableError(error)) {
      throw new Error('Apple Reminders cloud table is not configured. Run docs/supabase/apple-reminders.sql in Supabase.');
    }
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
      if (error.code === '42703' || isMissingCloudTableError(error)) {
        return [];
      }
      throw error;
    }
    return (data as LongTermIdeaRow[] | null)?.map(toLongTermIdea) ?? [];
  },

  async upsertLongTermIdea(userId: string, idea: LongTermIdea): Promise<void> {
    const supabase = requireSupabase();
    const row = toLongTermIdeaRow(userId, idea);
    const { error } = await supabase
      .from('long_term_ideas')
      .upsert(row, { onConflict: 'id' });

    if (error) {
      if (error.code === '42703' || isMissingCloudTableError(error)) {
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

    if (error && !isMissingCloudTableError(error)) throw error;
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
  versions: LongTermIdea['versions'];
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
    progress: row.progress as LongTermIdea['progress'],
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
