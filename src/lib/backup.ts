import { exportSnapshot, importSnapshot } from "./db";
import type { BackupSnapshot } from "../types";

// Скачать прогресс файлом JSON (для переноса между iPhone и Mac).
export async function downloadBackup(version: string) {
  const snap = await exportSnapshot(version);
  const blob = new Blob([JSON.stringify(snap, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `polski-trener-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Загрузить прогресс из выбранного файла.
export async function uploadBackup(file: File): Promise<void> {
  const text = await file.text();
  let snap: BackupSnapshot;
  try {
    snap = JSON.parse(text);
  } catch {
    throw new Error("Не удалось прочитать файл: это не корректный JSON.");
  }
  await importSnapshot(snap);
}
