import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  Card,
  CardProgress,
  PersonalAnswer,
  ExamResult,
  BackupSnapshot,
  NotebookMark,
  GameState,
  SavedWord,
} from "../types";
import { DEFAULT_GAME } from "./game";

interface TrenerDB extends DBSchema {
  progress: { key: string; value: CardProgress };
  personal: { key: string; value: PersonalAnswer };
  exams: { key: string; value: ExamResult };
  notebook: { key: string; value: NotebookMark };
  custom: { key: string; value: Card };
  words: { key: string; value: SavedWord };
  // meta хранит игровое состояние (key="game") и метки синхронизации (key="stamps").
  meta: { key: string; value: { key: string; data: unknown } };
}

// Метки последнего локального изменения коллекций — для облачного слияния
// last-write-wins (тетрадка/свои карточки/словарь).
export interface SyncStamps {
  notebook?: number;
  custom?: number;
  words?: number;
}

const DB_NAME = "polski-trener";
const DB_VERSION = 3;

let dbPromise: Promise<IDBPDatabase<TrenerDB>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<TrenerDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("progress")) {
          db.createObjectStore("progress", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("personal")) {
          db.createObjectStore("personal", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("exams")) {
          db.createObjectStore("exams", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("notebook")) {
          db.createObjectStore("notebook", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("custom")) {
          db.createObjectStore("custom", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("words")) {
          db.createObjectStore("words", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      },
    });
  }
  return dbPromise;
}

// --- Прогресс карточек ---

export async function getAllProgress(): Promise<CardProgress[]> {
  return (await getDB()).getAll("progress");
}

export async function getProgress(id: string): Promise<CardProgress | undefined> {
  return (await getDB()).get("progress", id);
}

export async function putProgress(p: CardProgress): Promise<void> {
  await (await getDB()).put("progress", p);
}

// --- Личные ответы ---

export async function getAllPersonal(): Promise<PersonalAnswer[]> {
  return (await getDB()).getAll("personal");
}

export async function putPersonal(p: PersonalAnswer): Promise<void> {
  await (await getDB()).put("personal", p);
}

// --- Результаты экзаменов ---

export async function getAllExams(): Promise<ExamResult[]> {
  return (await getDB()).getAll("exams");
}

export async function putExam(e: ExamResult): Promise<void> {
  await (await getDB()).put("exams", e);
}

// --- Тетрадка ---

export async function getAllNotebook(): Promise<NotebookMark[]> {
  return (await getDB()).getAll("notebook");
}

export async function putNotebook(m: NotebookMark): Promise<void> {
  await (await getDB()).put("notebook", m);
}

export async function deleteNotebook(id: string): Promise<void> {
  await (await getDB()).delete("notebook", id);
}

// --- Свои карточки ---

export async function getAllCustom(): Promise<Card[]> {
  return (await getDB()).getAll("custom");
}

export async function putCustom(c: Card): Promise<void> {
  await (await getDB()).put("custom", c);
}

export async function deleteCustom(id: string): Promise<void> {
  await (await getDB()).delete("custom", id);
}

// --- Личный словарь слов ---

export async function getAllWords(): Promise<SavedWord[]> {
  return (await getDB()).getAll("words");
}

export async function putWord(w: SavedWord): Promise<void> {
  await (await getDB()).put("words", w);
}

export async function deleteWord(id: string): Promise<void> {
  await (await getDB()).delete("words", id);
}

export async function replaceWords(list: SavedWord[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("words", "readwrite");
  await tx.store.clear();
  await Promise.all(list.map((w) => tx.store.put(w)));
  await tx.done;
}

// --- Игровое состояние ---

export async function getGame(): Promise<GameState> {
  const row = await (await getDB()).get("meta", "game");
  return (row?.data as GameState | undefined) ?? { ...DEFAULT_GAME };
}

export async function putGame(g: GameState): Promise<void> {
  await (await getDB()).put("meta", { key: "game", data: g });
}

// --- Метки синхронизации (тетрадка / свои карточки) ---

export async function getStamps(): Promise<SyncStamps> {
  const row = await (await getDB()).get("meta", "stamps");
  return (row?.data as SyncStamps | undefined) ?? {};
}

export async function setStamp(
  key: "notebook" | "custom" | "words",
  ts: number,
): Promise<void> {
  const db = await getDB();
  const cur = ((await db.get("meta", "stamps"))?.data as SyncStamps) ?? {};
  cur[key] = ts;
  await db.put("meta", { key: "stamps", data: cur });
}

// --- Полная замена коллекции (применение блоба из облака) ---

export async function replaceNotebook(list: NotebookMark[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("notebook", "readwrite");
  await tx.store.clear();
  await Promise.all(list.map((m) => tx.store.put(m)));
  await tx.done;
}

export async function replaceCustom(list: Card[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("custom", "readwrite");
  await tx.store.clear();
  await Promise.all(list.map((c) => tx.store.put(c)));
  await tx.done;
}

// --- Пакетная запись (применение данных из облака при синхронизации) ---

export async function putManyProgress(list: CardProgress[]): Promise<void> {
  if (!list.length) return;
  const db = await getDB();
  const tx = db.transaction("progress", "readwrite");
  await Promise.all(list.map((p) => tx.store.put(p)));
  await tx.done;
}

export async function putManyPersonal(list: PersonalAnswer[]): Promise<void> {
  if (!list.length) return;
  const db = await getDB();
  const tx = db.transaction("personal", "readwrite");
  await Promise.all(list.map((p) => tx.store.put(p)));
  await tx.done;
}

export async function putManyExams(list: ExamResult[]): Promise<void> {
  if (!list.length) return;
  const db = await getDB();
  const tx = db.transaction("exams", "readwrite");
  await Promise.all(list.map((e) => tx.store.put(e)));
  await tx.done;
}

// --- Экспорт / импорт ---

export async function exportSnapshot(version: string): Promise<BackupSnapshot> {
  const [progress, personal, exams, notebook, custom, words, game] = await Promise.all([
    getAllProgress(),
    getAllPersonal(),
    getAllExams(),
    getAllNotebook(),
    getAllCustom(),
    getAllWords(),
    getGame(),
  ]);
  return {
    app: "polski-trener",
    version,
    exportedAt: Date.now(),
    progress,
    personal,
    exams,
    notebook,
    custom,
    words,
    game,
  };
}

export async function importSnapshot(snap: BackupSnapshot): Promise<void> {
  if (snap.app !== "polski-trener") {
    throw new Error("Файл не похож на бэкап этого приложения.");
  }
  const db = await getDB();
  const stores = ["progress", "personal", "exams", "notebook", "custom", "words", "meta"] as const;
  const tx = db.transaction(stores, "readwrite");
  await Promise.all([
    ...(snap.progress ?? []).map((p) => tx.objectStore("progress").put(p)),
    ...(snap.personal ?? []).map((p) => tx.objectStore("personal").put(p)),
    ...(snap.exams ?? []).map((e) => tx.objectStore("exams").put(e)),
    ...(snap.notebook ?? []).map((m) => tx.objectStore("notebook").put(m)),
    ...(snap.custom ?? []).map((c) => tx.objectStore("custom").put(c)),
    ...(snap.words ?? []).map((w) => tx.objectStore("words").put(w)),
    ...(snap.game ? [tx.objectStore("meta").put({ key: "game", data: snap.game })] : []),
  ]);
  await tx.done;
}

export async function resetAll(): Promise<void> {
  const db = await getDB();
  const stores = ["progress", "personal", "exams", "notebook", "custom", "words", "meta"] as const;
  const tx = db.transaction(stores, "readwrite");
  await Promise.all(stores.map((s) => tx.objectStore(s).clear()));
  await tx.done;
}
