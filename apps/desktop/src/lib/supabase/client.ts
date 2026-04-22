import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient as BaseSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export type SupabaseClient = BaseSupabaseClient<Database>;

let instance: SupabaseClient | null = null;

/** Alias for getSupabase() — provided for ergonomics in component files. */
export const createClient = (): SupabaseClient => getSupabase();

export function getSupabase(): SupabaseClient {
  if (!instance) {
    instance = createSupabaseClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          flowType: "pkce",
          detectSessionInUrl: true,
        },
      }
    );
  }
  return instance;
}
