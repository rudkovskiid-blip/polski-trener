import { supabase } from "./supabase";
import type {
  CardProgress,
  PersonalAnswer,
  ExamResult,
  NotebookMark,
  Card,
  GameState,
  SavedWord,
} from "../types";
import {
  getAllProgress,
  getAllPersonal,
  getAllExams,
  getAllNotebook,
  getAllCustom,
  getAllWords,
  getGame,
  putManyProgress,
  putManyPersonal,
  putManyExams,
  replaceNotebook,
  replaceCustom,
  replaceWords,
  putGame,
  getStamps,
  setStamp,
} from "./db";

// Облачная синхронизация: весь прогресс и изменения привязаны к аккаунту.
//
// Модель данных (см. supabase/schema.sql):
//  - progress/personal — по строке на запись, last-write-wins по updatedAt;
//  - exams — неизменяемы, объединение по id;
//  - docs — «блобы» (тетрадка, свои карточки, игра) по строке на ключ:
//    тетрадка/свои карточки — last-write-wins по метке; игра — умное слияние.

type ProgressRow = { card_id: string; updated_at: number; data: CardProgress };
type PersonalRow = { card_id: string; updated_at: number; data: PersonalAnswer };
type ExamRow = { exam_id: string; data: ExamResult };
type DocRow = { key: string; updated_at: number; data: unknown };

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

// Инкрементальный пуш «документа» (тетрадка/свои карточки/словарь/игра).
export async function pushDoc(
  userId: string,
  key: "notebook" | "custom" | "words" | "game",
  data: unknown,
  updatedAt: number,
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("docs").upsert(
      { user_id: userId, key, updated_at: updatedAt, data },
      { onConflict: "user_id,key" },
    );
  } catch {
    /* офлайн */
  }
}

// Умное слияние игрового состояния — монотонное, ничего не теряет:
// XP/победы = максимум, дни и ачивки объединяются (у ачивки — самая ранняя дата).
function mergeGame(a: GameState, b: GameState): GameState {
  const ach: Record<string, number> = { ...a.ach };
  for (const [id, ts] of Object.entries(b.ach)) {
    ach[id] = ach[id] != null ? Math.min(ach[id], ts) : ts;
  }
  const days = [...new Set([...a.days, ...b.days])].sort();
  const bossLastWin =
    Math.max(a.bossLastWin ?? 0, b.bossLastWin ?? 0) || null;
  return {
    xp: Math.max(a.xp, b.xp),
    bossWins: Math.max(a.bossWins, b.bossWins),
    bossLastWin,
    ach,
    days,
  };
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

  // --- docs: тетрадка, свои карточки, игра ---
  {
    const { data: rows, error } = await supabase
      .from("docs")
      .select("key, updated_at, data")
      .eq("user_id", userId);
    if (error) throw error;
    const cloud = new Map((rows as DocRow[]).map((r) => [r.key, r]));
    const stamps = await getStamps();

    const upsertDoc = async (
      key: "notebook" | "custom" | "words" | "game",
      data: unknown,
      updatedAt: number,
    ) => {
      const { error: upErr } = await supabase!
        .from("docs")
        .upsert(
          { user_id: userId, key, updated_at: updatedAt, data },
          { onConflict: "user_id,key" },
        );
      if (upErr) throw upErr;
    };

    // Тетрадка и свои карточки — last-write-wins по метке.
    const localNotebook = await getAllNotebook();
    {
      const c = cloud.get("notebook");
      const localStamp = stamps.notebook ?? 0;
      const cloudStamp = c?.updated_at ?? 0;
      if (cloudStamp > localStamp) {
        await replaceNotebook(c!.data as NotebookMark[]);
        await setStamp("notebook", cloudStamp);
      } else if (localStamp > cloudStamp) {
        await upsertDoc("notebook", localNotebook, localStamp);
      } else if (cloudStamp === 0 && localNotebook.length) {
        const ts = Date.now();
        await upsertDoc("notebook", localNotebook, ts);
        await setStamp("notebook", ts);
      }
    }

    const localCustom = await getAllCustom();
    {
      const c = cloud.get("custom");
      const localStamp = stamps.custom ?? 0;
      const cloudStamp = c?.updated_at ?? 0;
      if (cloudStamp > localStamp) {
        await replaceCustom(c!.data as Card[]);
        await setStamp("custom", cloudStamp);
      } else if (localStamp > cloudStamp) {
        await upsertDoc("custom", localCustom, localStamp);
      } else if (cloudStamp === 0 && localCustom.length) {
        const ts = Date.now();
        await upsertDoc("custom", localCustom, ts);
        await setStamp("custom", ts);
      }
    }

    const localWords = await getAllWords();
    {
      const c = cloud.get("words");
      const localStamp = stamps.words ?? 0;
      const cloudStamp = c?.updated_at ?? 0;
      if (cloudStamp > localStamp) {
        await replaceWords(c!.data as SavedWord[]);
        await setStamp("words", cloudStamp);
      } else if (localStamp > cloudStamp) {
        await upsertDoc("words", localWords, localStamp);
      } else if (cloudStamp === 0 && localWords.length) {
        const ts = Date.now();
        await upsertDoc("words", localWords, ts);
        await setStamp("words", ts);
      }
    }

    // Игра — умное слияние (ничего не теряется).
    {
      const localGame = await getGame();
      const c = cloud.get("game");
      const merged = c ? mergeGame(localGame, c.data as GameState) : localGame;
      await putGame(merged);
      await upsertDoc("game", merged, Date.now());
    }
  }
}
