import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  CardProgress,
  PersonalAnswer,
  ExamResult,
  BackupSnapshot,
} from "../types";

interface TrenerDB extends DBSchema {
  progress: { key: string; value: CardProgress };
  personal: { key: string; value: PersonalAnswer };
  exams: { key: string; value: ExamResult };
}

const DB_NAME = "polski-trener";
const DB_VERSION = 1;

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

// --- Экспорт / импорт ---

export async function exportSnapshot(version: string): Promise<BackupSnapshot> {
  const [progress, personal, exams] = await Promise.all([
    getAllProgress(),
    getAllPersonal(),
    getAllExams(),
  ]);
  return {
    app: "polski-trener",
    version,
    exportedAt: Date.now(),
    progress,
    personal,
    exams,
  };
}

export async function importSnapshot(snap: BackupSnapshot): Promise<void> {
  if (snap.app !== "polski-trener") {
    throw new Error("Файл не похож на бэкап этого приложения.");
  }
  const db = await getDB();
  const tx = db.transaction(["progress", "personal", "exams"], "readwrite");
  await Promise.all([
    ...(snap.progress ?? []).map((p) => tx.objectStore("progress").put(p)),
    ...(snap.personal ?? []).map((p) => tx.objectStore("personal").put(p)),
    ...(snap.exams ?? []).map((e) => tx.objectStore("exams").put(e)),
  ]);
  await tx.done;
}

export async function resetAll(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["progress", "personal", "exams"], "readwrite");
  await Promise.all([
    tx.objectStore("progress").clear(),
    tx.objectStore("personal").clear(),
    tx.objectStore("exams").clear(),
  ]);
  await tx.done;
}
