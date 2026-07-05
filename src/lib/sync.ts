import { supabase } from "./supabase";
import type { CardProgress, PersonalAnswer, ExamResult } from "../types";
import {
  getAllProgress,
  getAllPersonal,
  getAllExams,
  putManyProgress,
  putManyPersonal,
  putManyExams,
} from "./db";

// Облачная синхронизация прогресса между устройствами.
//
// Модель данных (см. supabase/schema.sql): три таблицы, каждая строка —
// одна запись пользователя в виде jsonb `data` + метка `updated_at` (ms).
// Слияние: для progress/personal выигрывает более свежая запись
// (last-write-wins по updatedAt); экзамены неизменяемы и объединяются по id.

type ProgressRow = { card_id: string; updated_at: number; data: CardProgress };
type PersonalRow = { card_id: string; updated_at: number; data: PersonalAnswer };
type ExamRow = { exam_id: string; data: ExamResult };

const progressRow = (userId: string, p: CardProgress) => ({
  user_id: userId,
  card_id: p.id,
  updated_at: p.updatedAt,
  data: p,
});

const personalRow = (userId: string, p: PersonalAnswer) => ({
  user_id: userId,
  card_id: p.id,
  updated_at: p.updatedAt,
  data: p,
});

const examRow = (userId: string, e: ExamResult) => ({
  user_id: userId,
  exam_id: e.id,
  data: e,
});

// --- Инкрементальный пуш одной записи (вызывается после каждой правки) ---
// Тихо проглатывает ошибки (например, офлайн): расхождения устранит
// следующий полный syncAll при открытии/логине.

export async function pushProgress(userId: string, p: CardProgress): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("progress").upsert(progressRow(userId, p), {
      onConflict: "user_id,card_id",
    });
  } catch {
    /* офлайн — синхронизируем позже */
  }
}

export async function pushPersonal(userId: string, p: PersonalAnswer): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("personal").upsert(personalRow(userId, p), {
      onConflict: "user_id,card_id",
    });
  } catch {
    /* офлайн */
  }
}

export async function pushExam(userId: string, e: ExamResult): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("exams").upsert(examRow(userId, e), {
      onConflict: "user_id,exam_id",
    });
  } catch {
    /* офлайн */
  }
}

// --- Полная двусторонняя синхронизация ---
// Возвращает true при успехе; бросает исключение, если облако недоступно
// (чтобы UI показал ошибку). Локальные данные не теряются ни при каком исходе.

export async function syncAll(userId: string): Promise<void> {
  if (!supabase) throw new Error("Облако не настроено");

  const [localProgress, localPersonal, localExams] = await Promise.all([
    getAllProgress(),
    getAllPersonal(),
    getAllExams(),
  ]);

  // --- progress ---
  {
    const { data: rows, error } = await supabase
      .from("progress")
      .select("card_id, updated_at, data")
      .eq("user_id", userId);
    if (error) throw error;
    const cloud = new Map(
      (rows as ProgressRow[]).map((r) => [r.card_id, r]),
    );
    const local = new Map(localProgress.map((p) => [p.id, p]));
    const toLocal: CardProgress[] = [];
    const toCloud: ReturnType<typeof progressRow>[] = [];
    for (const id of new Set([...local.keys(), ...cloud.keys()])) {
      const l = local.get(id);
      const c = cloud.get(id);
      if (l && !c) toCloud.push(progressRow(userId, l));
      else if (!l && c) toLocal.push(c.data);
      else if (l && c) {
        if (l.updatedAt > c.updated_at) toCloud.push(progressRow(userId, l));
        else if (c.updated_at > l.updatedAt) toLocal.push(c.data);
      }
    }
    await putManyProgress(toLocal);
    if (toCloud.length) {
      const { error: upErr } = await supabase
        .from("progress")
        .upsert(toCloud, { onConflict: "user_id,card_id" });
      if (upErr) throw upErr;
    }
  }

  // --- personal ---
  {
    const { data: rows, error } = await supabase
      .from("personal")
      .select("card_id, updated_at, data")
      .eq("user_id", userId);
    if (error) throw error;
    const cloud = new Map(
      (rows as PersonalRow[]).map((r) => [r.card_id, r]),
    );
    const local = new Map(localPersonal.map((p) => [p.id, p]));
    const toLocal: PersonalAnswer[] = [];
    const toCloud: ReturnType<typeof personalRow>[] = [];
    for (const id of new Set([...local.keys(), ...cloud.keys()])) {
      const l = local.get(id);
      const c = cloud.get(id);
      if (l && !c) toCloud.push(personalRow(userId, l));
      else if (!l && c) toLocal.push(c.data);
      else if (l && c) {
        if (l.updatedAt > c.updated_at) toCloud.push(personalRow(userId, l));
        else if (c.updated_at > l.updatedAt) toLocal.push(c.data);
      }
    }
    await putManyPersonal(toLocal);
    if (toCloud.length) {
      const { error: upErr } = await supabase
        .from("personal")
        .upsert(toCloud, { onConflict: "user_id,card_id" });
      if (upErr) throw upErr;
    }
  }

  // --- exams (неизменяемы, объединение по id) ---
  {
    const { data: rows, error } = await supabase
      .from("exams")
      .select("exam_id, data")
      .eq("user_id", userId);
    if (error) throw error;
    const cloud = new Map((rows as ExamRow[]).map((r) => [r.exam_id, r]));
    const local = new Map(localExams.map((e) => [e.id, e]));
    const toLocal: ExamResult[] = [];
    const toCloud: ReturnType<typeof examRow>[] = [];
    for (const id of new Set([...local.keys(), ...cloud.keys()])) {
      if (local.has(id) && !cloud.has(id)) toCloud.push(examRow(userId, local.get(id)!));
      else if (!local.has(id) && cloud.has(id)) toLocal.push(cloud.get(id)!.data);
    }
    await putManyExams(toLocal);
    if (toCloud.length) {
      const { error: upErr } = await supabase
        .from("exams")
        .upsert(toCloud, { onConflict: "user_id,exam_id" });
      if (upErr) throw upErr;
    }
  }
}
