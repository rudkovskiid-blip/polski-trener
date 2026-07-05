import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Ключи задаются через переменные окружения Vite.
// anon-ключ безопасно публиковать во фронтенде: доступ к данным ограничен
// политиками Row Level Security на стороне Supabase (см. supabase/schema.sql).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// Облако включается только если оба ключа заданы. Иначе приложение
// работает как раньше — полностью офлайн на IndexedDB.
export const isCloudEnabled = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isCloudEnabled
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Логинимся паролем, магические ссылки не используем — детектить их в URL не нужно.
        detectSessionInUrl: false,
      },
    })
  : null;
