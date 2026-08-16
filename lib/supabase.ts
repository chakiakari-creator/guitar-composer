import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase の環境変数 (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY) が設定されていません。.env.local を確認してください。"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// presets テーブルの1コード分のスナップショット（コード名・拍数）
export interface CloudPresetChord {
  chord: string;
  beats: number;
}

// presets テーブルの行そのもの
export interface CloudPreset {
  id: string;
  created_at: string;
  name: string;
  bpm: number;
  key_name: string;
  play_mode: "stroke" | "arpeggio";
  stroke_pattern: string | null;
  // アルペジオモードのグリッド設定。具体的な形は app/page.tsx の ArpeggioPattern 型に依存するため
  // ここでは緩く型付けし、読み込み側でキャストして扱う。
  arpeggio_pattern: Record<string, unknown> | null;
  chords: CloudPresetChord[];
}

export type NewCloudPreset = Omit<CloudPreset, "id" | "created_at">;
