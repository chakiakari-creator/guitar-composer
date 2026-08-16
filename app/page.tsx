"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Play, Square, Music, Sliders, Repeat, Sparkles, Shuffle, ShieldCheck, Disc, Download, HelpCircle, X, Sparkle, Music2, Music4, Cloud, CloudUpload, FolderOpen, Trash2, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase, type CloudPreset, type NewCloudPreset } from "@/lib/supabase";

// ============================================================
// 音楽理論 & 定義
// ============================================================
const OPEN_STRINGS_FREQ = [82.41, 110.0, 146.83, 196.0, 246.94, 329.63];
const C_MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];

// 機能和声: Tonic(安定) / Subdominant(展開) / Dominant(進行力・解決欲求)
// マイナーキーでは Tm(トニックマイナー) / SDm(サブドミナントマイナー) を使用。Dは長短で共通。
type HarmonicFunction = "T" | "SD" | "D" | "Tm" | "SDm";

// 度数（ローマ数字）表記。カデンツ判定にはT/SD/Dだけでなく、この精度が必要
// （例: 全終止はT一般ではなく「I」着地、偽終止は「VIm」着地でなければならない）
type ChordDegree =
  // メジャーキー
  | "I" | "IIm" | "IIIm" | "IV" | "V" | "VIm" | "VIIb5" | "secDom"
  // マイナーキー（Key Am基準）
  | "Im" | "bIII" | "IVm" | "IIm7b5" | "bVI" | "IV7" | "V7" | "Vm7" | "bVII" | "bVII7" | "VIIm7b5";

type KeyMode = "major" | "minor";

interface ChordVoicing {
  name: string;
  frets: number[]; // 6弦分。-1 = ミュート。E-A-D-G-B-E の順（OPEN_STRINGS_FREQ / baseMidi と対応）
  chordTones: number[]; // ルートからの音程クラス(0-11)。スラッシュコードは分子側のトライアドで代表する
  function: HarmonicFunction;
  degree: ChordDegree;
}

// Key C 基準・ギターで弾きやすいオープン/ローポジション優先のボイシング集
const CHORD_LIBRARY: ChordVoicing[] = [
  // --- ダイアトニック・トライアド ---
  { name: "C", frets: [-1, 3, 2, 0, 1, 0], chordTones: [0, 4, 7], function: "T", degree: "I" },
  { name: "Dm", frets: [-1, -1, 0, 2, 3, 1], chordTones: [2, 5, 9], function: "SD", degree: "IIm" },
  { name: "Em", frets: [0, 2, 2, 0, 0, 0], chordTones: [4, 7, 11], function: "T", degree: "IIIm" },
  { name: "F", frets: [1, 3, 3, 2, 1, 1], chordTones: [5, 9, 0], function: "SD", degree: "IV" },
  { name: "G", frets: [3, 2, 0, 0, 0, 3], chordTones: [7, 11, 2], function: "D", degree: "V" },
  { name: "Am", frets: [-1, 0, 2, 2, 1, 0], chordTones: [9, 0, 4], function: "T", degree: "VIm" },
  // Bm7(b5) = vii半減7。この開放形フォームは実際には4声(B,D,F,A)を鳴らすハーフディミニッシュ7th
  { name: "Bm7b5", frets: [-1, 2, 3, 2, 3, -1], chordTones: [11, 2, 5, 9], function: "D", degree: "VIIb5" },

  // --- メジャー7th / マイナー7th ---
  { name: "Cmaj7", frets: [-1, 3, 2, 0, 0, 0], chordTones: [0, 4, 7, 11], function: "T", degree: "I" },
  { name: "Fmaj7", frets: [-1, -1, 3, 2, 1, 0], chordTones: [5, 9, 0, 4], function: "SD", degree: "IV" },
  { name: "Dm7", frets: [-1, -1, 0, 2, 1, 1], chordTones: [2, 5, 9, 0], function: "SD", degree: "IIm" },
  { name: "Em7", frets: [0, 2, 0, 0, 0, 0], chordTones: [4, 7, 11, 2], function: "T", degree: "IIIm" },
  { name: "Am7", frets: [-1, 0, 2, 0, 1, 0], chordTones: [9, 0, 4, 7], function: "T", degree: "VIm" },

  // --- ドミナント7th（セカンダリードミナント含む） ---
  { name: "G7", frets: [3, 2, 0, 0, 0, 1], chordTones: [7, 11, 2, 5], function: "D", degree: "V" },
  { name: "E7", frets: [0, 2, 0, 1, 0, 0], chordTones: [4, 8, 11, 2], function: "D", degree: "secDom" }, // V7/VIm
  { name: "A7", frets: [-1, 0, 2, 0, 2, 0], chordTones: [9, 1, 4, 7], function: "D", degree: "secDom" }, // V7/IIm

  // --- sus4 / add9 ---
  { name: "Csus4", frets: [-1, 3, 3, 0, 1, 1], chordTones: [0, 5, 7], function: "T", degree: "I" },
  { name: "Gsus4", frets: [3, 3, 0, 0, 1, 3], chordTones: [7, 0, 2], function: "D", degree: "V" },
  { name: "Cadd9", frets: [-1, 3, 2, 0, 3, 0], chordTones: [0, 4, 7, 2], function: "T", degree: "I" },
  { name: "Fadd9", frets: [-1, -1, 3, 2, 1, 3], chordTones: [5, 9, 0, 7], function: "SD", degree: "IV" },

  // --- 分数コード / オンベース（響きは分子側のトライアド） ---
  { name: "G/B", frets: [-1, 2, 0, 0, 0, 3], chordTones: [7, 11, 2], function: "D", degree: "V" },
  { name: "F/A", frets: [-1, 0, 3, 2, 1, 1], chordTones: [5, 9, 0], function: "SD", degree: "IV" },
  { name: "C/E", frets: [0, 3, 2, 0, 1, 0], chordTones: [0, 4, 7], function: "T", degree: "I" },
];

// Key Am 基準・自然/和声/旋律短音階から実用的に選んだマイナーダイアトニック・ボイシング集。
// Am,C,Dm,Em,F,G,G7,Em7,Dm7,Cmaj7,Fmaj7,Am7,Bm7b5 は長調ライブラリと同じ響き（同じ弦・フレット）を
// 短調の文脈で再解釈しているだけなので、実体（frets/chordTones）を再利用している。
const MINOR_CHORD_LIBRARY: ChordVoicing[] = [
  // --- Tm: トニックマイナー ---
  { name: "Am", frets: [-1, 0, 2, 2, 1, 0], chordTones: [9, 0, 4], function: "Tm", degree: "Im" },
  { name: "Am7", frets: [-1, 0, 2, 0, 1, 0], chordTones: [9, 0, 4, 7], function: "Tm", degree: "Im" },
  { name: "C", frets: [-1, 3, 2, 0, 1, 0], chordTones: [0, 4, 7], function: "Tm", degree: "bIII" },
  { name: "Cmaj7", frets: [-1, 3, 2, 0, 0, 0], chordTones: [0, 4, 7, 11], function: "Tm", degree: "bIII" },

  // --- SDm: サブドミナントマイナー ---
  { name: "Dm", frets: [-1, -1, 0, 2, 3, 1], chordTones: [2, 5, 9], function: "SDm", degree: "IVm" },
  { name: "Dm7", frets: [-1, -1, 0, 2, 1, 1], chordTones: [2, 5, 9, 0], function: "SDm", degree: "IVm" },
  { name: "Bm7b5", frets: [-1, 2, 3, 2, 3, -1], chordTones: [11, 2, 5, 9], function: "SDm", degree: "IIm7b5" },
  { name: "F", frets: [1, 3, 3, 2, 1, 1], chordTones: [5, 9, 0], function: "SDm", degree: "bVI" },
  { name: "Fmaj7", frets: [-1, -1, 3, 2, 1, 0], chordTones: [5, 9, 0, 4], function: "SDm", degree: "bVI" },
  // IV7 (D7): サブドミナントマイナーの代理としてよく使われるモーダル・ドミナント
  { name: "D7", frets: [-1, -1, 0, 2, 1, 2], chordTones: [2, 6, 9, 0], function: "SDm", degree: "IV7" },

  // --- D: ドミナント（長調と共通の機能） ---
  { name: "E7", frets: [0, 2, 0, 1, 0, 0], chordTones: [4, 8, 11, 2], function: "D", degree: "V7" }, // 和声短音階由来
  { name: "Em7", frets: [0, 2, 0, 0, 0, 0], chordTones: [4, 7, 11, 2], function: "D", degree: "Vm7" }, // 自然短音階由来
  { name: "G", frets: [3, 2, 0, 0, 0, 3], chordTones: [7, 11, 2], function: "D", degree: "bVII" },
  { name: "G7", frets: [3, 2, 0, 0, 0, 1], chordTones: [7, 11, 2, 5], function: "D", degree: "bVII7" },
  // VIIm7b5 (G#m7b5): 和声短音階の導音上に built られるハーフディミニッシュ（新規ボイシング）
  { name: "G#m7b5", frets: [4, 2, 0, -1, -1, 2], chordTones: [8, 11, 2, 6], function: "D", degree: "VIIm7b5" },
];

function getChordLibraryForMode(mode: KeyMode): ChordVoicing[] {
  return mode === "major" ? CHORD_LIBRARY : MINOR_CHORD_LIBRARY;
}

// "D"（ドミナント）は長調・短調で実体の異なるコード集合を指すため、必ずモード込みで取得する
// （固定の辞書にすると"D"キーが長調/短調どちらかでしか正しくならず衝突するため関数化）
function getChordsByFunctionGroup(mode: KeyMode, fn: HarmonicFunction): ChordVoicing[] {
  return getChordLibraryForMode(mode).filter((c) => c.function === fn);
}

function getFunctionGroupsForMode(mode: KeyMode): HarmonicFunction[] {
  return mode === "major" ? ["T", "SD", "D"] : ["Tm", "SDm", "D"];
}

const FUNCTION_LABELS: Record<HarmonicFunction, string> = {
  T: "Tonic（安定）",
  SD: "Subdominant（展開）",
  D: "Dominant（進行力・解決）",
  Tm: "Tonic minor（トニックマイナー）",
  SDm: "Subdominant minor（サブドミナントマイナー）",
};

const FUNCTION_SHORT_LABELS: Record<HarmonicFunction, string> = { T: "T", SD: "SD", D: "D", Tm: "Tm", SDm: "SDm" };

// 機能和声の配色: T=青系(安定) / SD=黄緑系(展開) / D=オレンジ系(進行力・緊張)
// マイナー: Tm=濃紺(indigo) / SDm=深緑・ティール(teal) / D はメジャーと共通のオレンジ
const FUNCTION_BADGE_STYLES: Record<HarmonicFunction, { badge: string; dot: string; border: string; ring: string }> = {
  T: { badge: "bg-sky-500/20 text-sky-300 border-sky-400/50", dot: "bg-sky-400", border: "border-sky-500/60", ring: "ring-sky-400" },
  SD: { badge: "bg-lime-500/20 text-lime-300 border-lime-400/50", dot: "bg-lime-400", border: "border-lime-500/60", ring: "ring-lime-400" },
  D: { badge: "bg-orange-500/20 text-orange-300 border-orange-400/50", dot: "bg-orange-400", border: "border-orange-500/60", ring: "ring-orange-400" },
  Tm: { badge: "bg-indigo-500/20 text-indigo-300 border-indigo-400/50", dot: "bg-indigo-400", border: "border-indigo-500/60", ring: "ring-indigo-400" },
  SDm: { badge: "bg-teal-500/20 text-teal-300 border-teal-400/50", dot: "bg-teal-400", border: "border-teal-500/60", ring: "ring-teal-400" },
};

// 6弦の開放弦MIDIノート番号（E2,A2,D3,G3,B3,E4 = 標準チューニング）
const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64];

// ボイシング中でミュートされていない最低音（ベース音）のMIDIノート番号を返す
function getChordBassMidiNote(chord: ChordVoicing): number {
  let bass = Infinity;
  chord.frets.forEach((fret, i) => {
    if (fret !== -1) {
      const note = OPEN_STRING_MIDI[i] + fret;
      if (note < bass) bass = note;
    }
  });
  return bass === Infinity ? 0 : bass;
}

// ============================================================
// カデンツ（Cadence）理論エンジン — メジャーキー
// ============================================================
const TONIC_DEGREES: ChordDegree[] = ["I", "VIm", "IIIm"];
const SUB_DEGREES: ChordDegree[] = ["IV", "IIm"];
const DOMINANT_GENERAL_DEGREES: ChordDegree[] = ["V", "VIIb5", "secDom"]; // 経過的なD（厳密な解決を要さない箇所）
const DOMINANT_RESOLVING_DEGREES: ChordDegree[] = ["V", "VIIb5"]; // カデンツ直前の「本当に解決するD」

function pickByDegreeFrom(library: ChordVoicing[], degrees: ChordDegree[], excludeName?: string): ChordVoicing {
  const pool = library.filter((c) => degrees.includes(c.degree));
  const candidates = excludeName ? pool.filter((c) => c.name !== excludeName) : pool;
  const list = candidates.length > 0 ? candidates : pool;
  return list[Math.floor(Math.random() * list.length)];
}

function pickByDegree(degrees: ChordDegree[], excludeName?: string): ChordVoicing {
  return pickByDegreeFrom(CHORD_LIBRARY, degrees, excludeName);
}

type CadenceEndingId = "perfect" | "deceptive" | "half" | "plagal";
type CadenceSkeletonId = "cadence1" | "cadence2" | "cadence3";
type CadenceMood = "auto" | "twoFiveOne" | "dominantResolve" | "gentleAmen" | "deceptive";

const CADENCE_ENDING_LABELS: Record<CadenceEndingId, string> = {
  perfect: "全終止 (Perfect Cadence)",
  deceptive: "偽終止 (Deceptive Cadence)",
  half: "半終止 (Half Cadence)",
  plagal: "変終止 (Plagal / アーメン終止)",
};

const CADENCE_SKELETON_LABELS: Record<CadenceSkeletonId, string> = {
  cadence1: "カデンツ1：T → D → T",
  cadence2: "カデンツ2：T → S → D → T",
  cadence3: "カデンツ3：T → S → T",
};

const CADENCE_MOOD_OPTIONS: { id: CadenceMood; label: string }[] = [
  { id: "auto", label: "🎲 おまかせカデンツ生成" },
  { id: "twoFiveOne", label: "⚡ 王道ツーファイブ (T-S-D-T)" },
  { id: "dominantResolve", label: "🔥 ドミナント解決 (T-D-T)" },
  { id: "gentleAmen", label: "🍃 穏やかアーメン (T-S-T)" },
  { id: "deceptive", label: "💫 切ない偽終止 (D→VIm)" },
];

interface CadenceResult {
  kind: "major";
  chords: string[];
  beats: BlockBeats[];
  skeletonId: CadenceSkeletonId;
  skeletonLabel: string;
  endingId: CadenceEndingId;
  endingLabel: string;
}

// カデンツ1 (T → D → T): [T] → [TまたはD] → [D] → [T]
function buildCadence1(): { bars: ChordVoicing[]; endingId: CadenceEndingId } {
  const bar1 = pickByDegree(TONIC_DEGREES);
  const bar2 =
    Math.random() < 0.5
      ? pickByDegree(TONIC_DEGREES, bar1.name)
      : pickByDegree(DOMINANT_GENERAL_DEGREES, bar1.name);
  const bar3 = pickByDegree(DOMINANT_RESOLVING_DEGREES, bar2.name);

  const canDeceptive = bar3.degree === "V";
  const endingId: CadenceEndingId = canDeceptive && Math.random() < 0.3 ? "deceptive" : "perfect";
  const bar4 = endingId === "deceptive" ? pickByDegree(["VIm"], bar3.name) : pickByDegree(["I"], bar3.name);

  return { bars: [bar1, bar2, bar3, bar4], endingId };
}

// カデンツ2 (T → S → D → T)：王道ツーファイブワンを含む本命パターン
function buildCadence2(forcedEnding?: CadenceEndingId): { bars: ChordVoicing[]; endingId: CadenceEndingId } {
  const bar1 = pickByDegree(TONIC_DEGREES);
  const bar2 = pickByDegree(SUB_DEGREES, bar1.name);
  // 偽終止(D7→VIm)は理論上V7(=G系)からでないと成立しないため、その場合はVIIb5を除外する
  const bar3Degrees: ChordDegree[] = forcedEnding === "deceptive" ? ["V"] : DOMINANT_RESOLVING_DEGREES;
  const bar3 = pickByDegree(bar3Degrees, bar2.name);

  let endingId = forcedEnding;
  if (!endingId) {
    const canDeceptive = bar3.degree === "V";
    endingId = canDeceptive && Math.random() < 0.25 ? "deceptive" : "perfect";
  }
  const bar4 = endingId === "deceptive" ? pickByDegree(["VIm"], bar3.name) : pickByDegree(["I"], bar3.name);

  return { bars: [bar1, bar2, bar3, bar4], endingId };
}

// カデンツ3 (T → S → T)：変終止（アーメン終止）中心の穏やかな進行
function buildCadence3(forcePlagal: boolean): { bars: ChordVoicing[]; endingId: CadenceEndingId } {
  const bar1 = pickByDegree(TONIC_DEGREES);
  const bar2 = pickByDegree(SUB_DEGREES, bar1.name);
  const bar3IsSub = forcePlagal ? true : Math.random() < 0.6;
  const bar3 = bar3IsSub ? pickByDegree(SUB_DEGREES, bar2.name) : pickByDegree(TONIC_DEGREES, bar2.name);
  const bar4 = pickByDegree(["I"], bar3.name);

  const endingId: CadenceEndingId = bar3IsSub ? "plagal" : "perfect";
  return { bars: [bar1, bar2, bar3, bar4], endingId };
}

// 半終止（Half Cadence）へ上書き: 4小節目をドミナントで終わらせ、次のループへの一息を作る
function applyHalfCadenceOverride(bars: ChordVoicing[]): ChordVoicing[] {
  const bar3 = bars[2];
  const bar4 = pickByDegree(["V"], bar3.name);
  return [bars[0], bars[1], bars[2], bar4];
}

// カデンツ（終止形）理論に基づく本格的な4小節進行生成
function generateCadenceProgression(mood: CadenceMood): CadenceResult {
  let skeletonId: CadenceSkeletonId;
  let result: { bars: ChordVoicing[]; endingId: CadenceEndingId };

  switch (mood) {
    case "twoFiveOne":
      skeletonId = "cadence2";
      result = buildCadence2("perfect");
      break;
    case "dominantResolve":
      skeletonId = "cadence1";
      result = buildCadence1();
      break;
    case "gentleAmen":
      skeletonId = "cadence3";
      result = buildCadence3(true);
      break;
    case "deceptive":
      skeletonId = "cadence2";
      result = buildCadence2("deceptive");
      break;
    case "auto":
    default: {
      const roll = Math.random();
      if (roll < 0.34) {
        skeletonId = "cadence1";
        result = buildCadence1();
      } else if (roll < 0.72) {
        skeletonId = "cadence2";
        result = buildCadence2();
      } else {
        skeletonId = "cadence3";
        result = buildCadence3(false);
      }
      // おまかせ時のみ、15%の確率で半終止（ループを促す一息）に差し替える
      if (Math.random() < 0.15) {
        result = { bars: applyHalfCadenceOverride(result.bars), endingId: "half" };
      }
      break;
    }
  }

  return {
    kind: "major",
    chords: result.bars.map((c) => c.name),
    beats: [4, 4, 4, 4],
    skeletonId,
    skeletonLabel: CADENCE_SKELETON_LABELS[skeletonId],
    endingId: result.endingId,
    endingLabel: CADENCE_ENDING_LABELS[result.endingId],
  };
}

// ============================================================
// カデンツ理論エンジン — マイナーキー（自然・和声・旋律短音階）
// ============================================================
interface MinorPatternEntry {
  degree: ChordDegree;
  beats: BlockBeats;
}

interface MinorCadencePattern {
  id: string;
  label: string;
  entries: MinorPatternEntry[];
}

const MINOR_CADENCE_PATTERNS: MinorCadencePattern[] = [
  {
    id: "minor_royal",
    label: "王道マイナー進行 (Im→bVI→bVII→Im)",
    entries: [
      { degree: "Im", beats: 4 },
      { degree: "bVI", beats: 4 },
      { degree: "bVII", beats: 4 },
      { degree: "Im", beats: 4 },
    ],
  },
  {
    id: "andalusian",
    label: "アンダルシア進行 (Im→bVII→bVI→V7)",
    entries: [
      { degree: "Im", beats: 4 },
      { degree: "bVII", beats: 4 },
      { degree: "bVI", beats: 4 },
      { degree: "V7", beats: 4 },
    ],
  },
  {
    id: "minor_251",
    label: "マイナーツーファイブワン (IIm7b5→V7→Im)",
    entries: [
      { degree: "IIm7b5", beats: 4 },
      { degree: "V7", beats: 4 },
      { degree: "Im", beats: 8 },
    ],
  },
  {
    id: "jpop_setsunai",
    label: "J-POP切ない系 (bVImaj7→bVII7→Im)",
    entries: [
      { degree: "bVI", beats: 4 },
      { degree: "bVII7", beats: 4 },
      { degree: "Im", beats: 8 },
    ],
  },
  {
    id: "subdominant_minor_resolve",
    label: "サブドミナントマイナー解決 (IVm7→V7→Im)",
    entries: [
      { degree: "IVm", beats: 4 },
      { degree: "V7", beats: 4 },
      { degree: "Im", beats: 8 },
    ],
  },
];

interface MinorPatternResult {
  kind: "minor";
  chords: string[];
  beats: BlockBeats[];
  patternId: string;
  patternLabel: string;
}

function generateMinorCadenceProgression(patternId: string): MinorPatternResult {
  const pattern = MINOR_CADENCE_PATTERNS.find((p) => p.id === patternId) ?? MINOR_CADENCE_PATTERNS[0];
  const chords: string[] = [];
  let prevName: string | undefined;
  for (const entry of pattern.entries) {
    const chord = pickByDegreeFrom(MINOR_CHORD_LIBRARY, [entry.degree], prevName);
    chords.push(chord.name);
    prevName = chord.name;
  }
  return {
    kind: "minor",
    chords,
    beats: pattern.entries.map((e) => e.beats),
    patternId: pattern.id,
    patternLabel: pattern.label,
  };
}

type GenerationResult = CadenceResult | MinorPatternResult;

interface ProgressionPreset {
  id: string;
  label: string;
  chords: string[];
}

// 記事で紹介される王道進行プリセット（度数はDegree表記。Key C基準）
const PROGRESSION_PRESETS: ProgressionPreset[] = [
  { id: "yakusoku_4536", label: "J-POP王道 (4-5-3-6)", chords: ["F", "G", "Em", "Am"] },
  { id: "canon_1563", label: "カノン進行 (1-5-6-3)", chords: ["C", "G", "Am", "Em"] },
  { id: "komuro_6451", label: "小室進行 (6-4-5-1)", chords: ["Am", "F", "G", "C"] },
  { id: "poppunk_1564", label: "ポップパンク進行 (1-5-6-4)", chords: ["C", "G", "Am", "F"] },
  { id: "just_two_4361", label: "Just the Two of Us系 (4-3-6-1)", chords: ["Fmaj7", "Em7", "Am7", "Cmaj7"] },
];

// 和声リズム・タイムストレッチ: 1ブロック = 1コード。長さは拍単位（1/2/4/8拍）で可変。
type BlockBeats = 1 | 2 | 4 | 8;

interface ProgressionBlock {
  id: string;
  chord: string;
  beats: BlockBeats;
}

let progressionBlockSeq = 0;
function createProgressionBlock(chord: string, beats: BlockBeats = 4): ProgressionBlock {
  progressionBlockSeq += 1;
  return { id: `blk-${progressionBlockSeq}`, chord, beats };
}

// "mute": ミュートストローク（全弦を打楽器的にチャックする奏法）
type StrokeDir = "down" | "up" | "none" | "mute";

interface StrokeAction {
  dir: StrokeDir;
  accent?: boolean;
}

// エディタでステップをクリックした時に巡回する順序
const STROKE_DIR_CYCLE: StrokeDir[] = ["none", "down", "up", "mute"];

interface StrokePattern {
  id: string;
  name: string;
  actions: StrokeAction[];
}

const STROKE_PATTERNS: StrokePattern[] = [
  {
    id: "pattern_6",
    name: "1. 8ビート定番 (タン-タタ-タン-タタ)",
    actions: [
      { dir: "down", accent: true }, { dir: "none" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "up" }, { dir: "none" },
      { dir: "down", accent: true }, { dir: "none" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "up" }, { dir: "none" },
    ],
  },
  {
    id: "pattern_7",
    name: "2. 8ビート定番 (タン-タタ-ンタ-タタ)",
    actions: [
      { dir: "down", accent: true }, { dir: "none" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "up" }, { dir: "none" },
      { dir: "none" }, { dir: "none" }, { dir: "up" }, { dir: "none" },
      { dir: "down", accent: true }, { dir: "none" }, { dir: "up" }, { dir: "none" },
    ],
  },
  {
    id: "pattern_8",
    name: "3. 16ビート定番 (タン-タン-タン-タタ...)",
    actions: [
      { dir: "down", accent: true }, { dir: "none" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "down" }, { dir: "up" },
      { dir: "down", accent: true }, { dir: "none" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "down" }, { dir: "up" },
    ],
  },
  {
    id: "pattern_9",
    name: "4. 16ビート定番 (タン-タン-タタ-タン...)",
    actions: [
      { dir: "down", accent: true }, { dir: "none" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "down" }, { dir: "up" },
      { dir: "down" }, { dir: "up" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "down" }, { dir: "up" },
    ],
  },
  {
    id: "pattern_10",
    name: "5. 16ビート定番 (タイ接続・空振りあり)",
    actions: [
      { dir: "down", accent: true }, { dir: "none" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "down" }, { dir: "up" },
      { dir: "none" }, { dir: "up" }, { dir: "none" }, { dir: "none" },
      { dir: "down" }, { dir: "none" }, { dir: "down" }, { dir: "up" },
    ],
  },
];

interface MelodyPattern {
  id: string;
  name: string;
  mask: boolean[];
}

const DEFAULT_MELODY_PATTERNS: MelodyPattern[] = [
  { id: "m1", name: "1. 表8分主体", mask: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false] },
  { id: "m2", name: "2. 裏8分シンコペ", mask: [false, false, true, false, false, false, true, false, false, false, true, false, false, false, true, false] },
  { id: "m3", name: "3. 16分駆け上がり", mask: [true, true, true, false, true, true, true, false, true, true, true, false, true, true, true, false] },
  { id: "m4", name: "4. ロングノート主体", mask: [true, false, false, false, false, false, false, false, true, false, false, false, false, false, false, false] },
  { id: "m5", name: "5. シンコペ（食い）", mask: [true, false, false, true, false, false, true, false, false, true, false, false, true, false, false, false] },
  { id: "m6", name: "6. ダンス/4つ打ち乗せ", mask: [true, false, false, false, true, false, true, false, true, false, false, false, true, false, true, false] },
  { id: "m7", name: "7. 跳ね系（スウィング風）", mask: [true, false, false, true, true, false, false, true, true, false, false, true, true, false, false, true] },
  { id: "m8", name: "8. 休符多め（ブレス重視）", mask: [true, false, false, false, true, false, false, false, false, false, true, false, false, false, false, false] },
  { id: "m9", name: "9. ビルドアップ", mask: [true, false, false, false, true, false, true, false, true, true, true, false, true, true, true, true] },
  { id: "m10", name: "10. ランダム・変則ノリ", mask: [true, true, false, true, false, true, true, false, true, false, true, true, false, true, false, true] },
];

// ============================================================
// アルペジオモード
// ============================================================
// 演奏モード: ストローク（コード弾き）/ アルペジオ（指弾き・弦個別指定）
type PlayMode = "stroke" | "arpeggio";

type ArpeggioSteps = 8 | 16;

interface ArpeggioPattern {
  id: string;
  name: string;
  steps: ArpeggioSteps;
  // grid[stringIndex][stepIndex]。stringIndex: 0=6弦(低E)...5=1弦(高E)。OPEN_STRINGS_FREQ/frets配列と同じ並び。
  grid: boolean[][];
}

function makeEmptyArpeggioGrid(steps: ArpeggioSteps): boolean[][] {
  return Array.from({ length: 6 }, () => Array(steps).fill(false));
}

function cloneArpeggioPattern(pattern: ArpeggioPattern): ArpeggioPattern {
  return { ...pattern, grid: pattern.grid.map((row) => [...row]) };
}

// 指定ステップ数へグリッドを再分配（可能な範囲で既存の打点位置を保つ）
function resizeArpeggioGrid(pattern: ArpeggioPattern, steps: ArpeggioSteps): ArpeggioPattern {
  if (steps === pattern.steps) return cloneArpeggioPattern(pattern);
  const factor = steps / pattern.steps;
  const grid = pattern.grid.map((row) => {
    if (factor < 1) {
      // 16→8: 2ステップに1つ間引いてサンプリング
      const ratio = Math.round(1 / factor);
      return row.filter((_, i) => i % ratio === 0);
    }
    // 8→16: 各打点を等間隔に引き伸ばして配置
    const next = Array(steps).fill(false);
    row.forEach((v, i) => {
      if (v) next[Math.round(i * factor)] = true;
    });
    return next;
  });
  return { id: "custom", name: "カスタム", steps, grid };
}

const ARPEGGIO_PRESETS: ArpeggioPattern[] = [
  {
    id: "arp_root_climb",
    name: "1. ルートから駆け上がり (6→3→2→1弦)",
    steps: 16,
    grid: (() => {
      const g = makeEmptyArpeggioGrid(16);
      g[0][0] = true; // 6弦(ルート) 1拍目
      g[3][4] = true; // 3弦 2拍目
      g[4][8] = true; // 2弦 3拍目
      g[5][12] = true; // 1弦 4拍目
      return g;
    })(),
  },
  {
    id: "arp_pima",
    name: "2. PIMA基本（親指ベース+3本指）",
    steps: 16,
    grid: (() => {
      const g = makeEmptyArpeggioGrid(16);
      [0, 8].forEach((s) => (g[0][s] = true)); // 親指(ベース弦) 1,3拍目
      [4, 12].forEach((s) => (g[1][s] = true)); // 親指(交互ベース) 2,4拍目
      g[3][2] = true;
      g[2][6] = true;
      g[4][10] = true;
      g[5][14] = true;
      return g;
    })(),
  },
  {
    id: "arp_16th_cascade",
    name: "3. 16分カスケード（低→高→低）",
    steps: 16,
    grid: (() => {
      const g = makeEmptyArpeggioGrid(16);
      const order = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0, 1, 2, 3, 4, 5];
      order.forEach((stringIdx, step) => {
        g[stringIdx][step] = true;
      });
      return g;
    })(),
  },
  {
    id: "arp_8th_simple",
    name: "4. シンプル8分（低音→高音）",
    steps: 8,
    grid: (() => {
      const g = makeEmptyArpeggioGrid(8);
      const order = [0, 3, 4, 5, 0, 3, 4, 5];
      order.forEach((stringIdx, step) => {
        g[stringIdx][step] = true;
      });
      return g;
    })(),
  },
];

const KEY_OFFSET_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
// マイナーキー名。keyOffset=0 は Key Am（MINOR_CHORD_LIBRARY の基準キー）
const MINOR_KEY_NAMES = ["Am", "A#m", "Bm", "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m"];

interface MidiEvent {
  ticks: number;
  type: "noteOn" | "noteOff";
  channel: number;
  note: number;
  velocity: number;
}

// 可変長バイト (VLQ)
function encodeVLQ(value: number): number[] {
  let v = Math.max(0, Math.floor(value));
  const buffer = [v & 0x7f];
  while ((v >>= 7) > 0) {
    buffer.unshift((v & 0x7f) | 0x80);
  }
  return buffer;
}

// テキストメタイベント文字列エンコード
function encodeTextMeta(type: number, text: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  return [0x00, 0xff, type, bytes.length, ...bytes];
}

// Logic Pro 完全対応 SMF Type 1 (マルチトラック＆テンポ読み込み保証) 生成関数
function buildLogicProPerfectSMF(events: MidiEvent[], bpm: number): Uint8Array {
  const ticksPerBeat = 96;
  const mpqn = Math.round(60000000 / bpm);

  // --------------------------------------------------
  // Track 0: Global Meta (Tempo, Time Sig, Title)
  // --------------------------------------------------
  const t0Data: number[] = [];
  t0Data.push(...encodeTextMeta(0x03, "Tempo Track")); // Track Name
  t0Data.push(0x00, 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08); // 4/4
  t0Data.push(
    0x00, 0xff, 0x51, 0x03,
    (mpqn >> 16) & 0xff,
    (mpqn >> 8) & 0xff,
    mpqn & 0xff
  ); // Tempo
  t0Data.push(0x00, 0xff, 0x2f, 0x00); // End of Track

  // --------------------------------------------------
  // Track 1: Guitar Chords (Channel 0)
  // --------------------------------------------------
  const guitarEvents = events.filter((e) => e.channel === 0).sort((a, b) => a.ticks - b.ticks);
  const t1Data: number[] = [];
  t1Data.push(...encodeTextMeta(0x03, "Guitar Chords"));

  let lastTick1 = 0;
  guitarEvents.forEach((ev) => {
    const delta = Math.max(0, ev.ticks - lastTick1);
    lastTick1 = ev.ticks;
    t1Data.push(...encodeVLQ(delta));
    const status = (ev.type === "noteOn" ? 0x90 : 0x80) | 0x00;
    t1Data.push(status, ev.note & 0x7f, ev.velocity & 0x7f);
  });
  t1Data.push(0x00, 0xff, 0x2f, 0x00);

  // --------------------------------------------------
  // Track 2: Melody (Channel 1)
  // --------------------------------------------------
  const melodyEvents = events.filter((e) => e.channel === 1).sort((a, b) => a.ticks - b.ticks);
  const t2Data: number[] = [];
  t2Data.push(...encodeTextMeta(0x03, "Melody Line"));

  let lastTick2 = 0;
  melodyEvents.forEach((ev) => {
    const delta = Math.max(0, ev.ticks - lastTick2);
    lastTick2 = ev.ticks;
    t2Data.push(...encodeVLQ(delta));
    const status = (ev.type === "noteOn" ? 0x90 : 0x80) | 0x01;
    t2Data.push(status, ev.note & 0x7f, ev.velocity & 0x7f);
  });
  t2Data.push(0x00, 0xff, 0x2f, 0x00);

  // --------------------------------------------------
  // Chunks Assembly
  // --------------------------------------------------
  const createChunk = (type: string, data: number[]) => {
    const len = data.length;
    const header = [
      type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3),
      (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff
    ];
    return [...header, ...data];
  };

  const headerChunk = [
    0x4d, 0x54, 0x68, 0x64, // "MThd" (chunk type is case-sensitive; a stray 0x74 here breaks every strict parser)
    0x00, 0x00, 0x00, 0x06, // Length 6
    0x00, 0x01,             // Format 1
    0x00, 0x03,             // 3 Tracks (Meta, Guitar, Melody)
    (ticksPerBeat >> 8) & 0xff, ticksPerBeat & 0xff
  ];

  const t0Chunk = createChunk("MTrk", t0Data);
  const t1Chunk = createChunk("MTrk", t1Data);
  const t2Chunk = createChunk("MTrk", t2Data);

  return new Uint8Array([...headerChunk, ...t0Chunk, ...t1Chunk, ...t2Chunk]);
}

export default function GuitarComposer() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeMelodyGainRef = useRef<GainNode | null>(null);

  // 設定
  const [bpm, setBpm] = useState(110);
  const [keyOffset, setKeyOffset] = useState(0);
  const [keyMode, setKeyMode] = useState<KeyMode>("major");
  const [selectedPatternId, setSelectedPatternId] = useState<string>("pattern_6");
  const [selectedMinorPatternId, setSelectedMinorPatternId] = useState<string>(MINOR_CADENCE_PATTERNS[0].id);
  const [progression, setProgression] = useState<ProgressionBlock[]>(() =>
    ["C", "G", "Am", "F"].map((chord) => createProgressionBlock(chord, 4))
  );
  // カデンツ生成エンジンで作った直近の進行の理論的な内訳（骨格＋終止形、または短調パターン名）。手動編集/プリセット適用で null に戻す。
  const [lastCadenceResult, setLastCadenceResult] = useState<GenerationResult | null>(null);
  const [strokeQuantizeMode, setStrokeQuantizeMode] = useState<boolean>(false);

  // 演奏モード（ストローク/アルペジオ）
  const [playMode, setPlayMode] = useState<PlayMode>("stroke");
  // プリセットから編集を始めると null でなくなり、以後はこちらが優先される
  const [customStrokeActions, setCustomStrokeActions] = useState<StrokeAction[] | null>(null);
  const [arpeggioPattern, setArpeggioPattern] = useState<ArpeggioPattern>(() => cloneArpeggioPattern(ARPEGGIO_PRESETS[0]));

  // 現在再生に使う実際のストロークパターン（カスタム編集があればそちらを優先）
  const activeStrokeActions = useMemo(() => {
    if (customStrokeActions) return customStrokeActions;
    return STROKE_PATTERNS.find((p) => p.id === selectedPatternId)?.actions ?? STROKE_PATTERNS[0].actions;
  }, [customStrokeActions, selectedPatternId]);

  // 現在のキー（長調/短調）に対応するコードライブラリ
  const activeChordLibrary = useMemo(() => getChordLibraryForMode(keyMode), [keyMode]);
  const activeFunctionGroups = useMemo(() => getFunctionGroupsForMode(keyMode), [keyMode]);

  const [melodyPatterns, setMelodyPatterns] = useState<MelodyPattern[]>(DEFAULT_MELODY_PATTERNS);
  const [selectedMelodyPatternId, setSelectedMelodyPatternId] = useState<string>("m1");
  const [melodyEnabled, setMelodyEnabled] = useState<boolean>(true);

  const [noteDensity, setNoteDensity] = useState<number>(50);

  const [allowPassingTones, setAllowPassingTones] = useState<boolean>(false);
  const [allowOnlyShortNotes, setAllowOnlyShortNotes] = useState<boolean>(false);
  const [forceChordToneOnChordChange, setForceChordToneOnChordChange] = useState<boolean>(true);

  // 録音 & MIDI状態
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isCountingIn, setIsCountingIn] = useState<boolean>(false);
  const [countInBeatsLeft, setCountInBeatsLeft] = useState<number>(4);
  const [recordedEvents, setRecordedEvents] = useState<MidiEvent[]>([]);
  const totalTickCounterRef = useRef<number>(0);

  // パレット縦位置
  const [paletteY, setPaletteY] = useState<number>(0.5);
  const paletteYRef = useRef<number>(0.5);

  // 再生状態
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [currentBar, setCurrentBar] = useState(0);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  // クラウドプリセット（Supabase）
  const [cloudPresets, setCloudPresets] = useState<CloudPreset[]>([]);
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);
  const [isSavingPreset, setIsSavingPreset] = useState(false);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveNameInput, setSaveNameInput] = useState("");
  const [isPresetLibraryOpen, setIsPresetLibraryOpen] = useState(false);
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  // スケジューラー参照
  const isPlayingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const isCountingInRef = useRef(false);
  const countInRemainingStepsRef = useRef(0);
  const bpmRef = useRef(bpm);
  const keyOffsetRef = useRef(keyOffset);
  const keyModeRef = useRef(keyMode);
  const selectedPatternIdRef = useRef(selectedPatternId);
  const selectedMelodyPatternIdRef = useRef(selectedMelodyPatternId);
  const melodyPatternsRef = useRef(melodyPatterns);
  const melodyEnabledRef = useRef(melodyEnabled);
  const progressionRef = useRef(progression);
  const strokeQuantizeModeRef = useRef(strokeQuantizeMode);
  const playModeRef = useRef(playMode);
  const activeStrokeActionsRef = useRef(activeStrokeActions);
  const arpeggioPatternRef = useRef(arpeggioPattern);

  const allowPassingTonesRef = useRef(allowPassingTones);
  const allowOnlyShortNotesRef = useRef(allowOnlyShortNotes);
  const forceChordToneOnChordChangeRef = useRef(forceChordToneOnChordChange);

  const nextNoteTimeRef = useRef(0);
  // currentLocalStepRef: 現在のブロック内でのローカル16分音符ステップ（ブロックの拍数により範囲が可変）
  // currentBlockIndexRef: progression配列上の現在のコードブロックのインデックス
  const currentLocalStepRef = useRef(0);
  const currentBlockIndexRef = useRef(0);
  const timerIdRef = useRef<number | null>(null);

  useEffect(() => { bpmRef.current = bpm; }, [bpm]);
  useEffect(() => { keyOffsetRef.current = keyOffset; }, [keyOffset]);
  useEffect(() => { keyModeRef.current = keyMode; }, [keyMode]);
  useEffect(() => { selectedPatternIdRef.current = selectedPatternId; }, [selectedPatternId]);
  useEffect(() => { selectedMelodyPatternIdRef.current = selectedMelodyPatternId; }, [selectedMelodyPatternId]);
  useEffect(() => { melodyPatternsRef.current = melodyPatterns; }, [melodyPatterns]);
  useEffect(() => { melodyEnabledRef.current = melodyEnabled; }, [melodyEnabled]);
  useEffect(() => { progressionRef.current = progression; }, [progression]);
  useEffect(() => { strokeQuantizeModeRef.current = strokeQuantizeMode; }, [strokeQuantizeMode]);
  useEffect(() => { playModeRef.current = playMode; }, [playMode]);
  useEffect(() => { activeStrokeActionsRef.current = activeStrokeActions; }, [activeStrokeActions]);
  useEffect(() => { arpeggioPatternRef.current = arpeggioPattern; }, [arpeggioPattern]);

  useEffect(() => { allowPassingTonesRef.current = allowPassingTones; }, [allowPassingTones]);
  useEffect(() => { allowOnlyShortNotesRef.current = allowOnlyShortNotes; }, [allowOnlyShortNotes]);
  useEffect(() => { forceChordToneOnChordChangeRef.current = forceChordToneOnChordChange; }, [forceChordToneOnChordChange]);
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);

  useEffect(() => { paletteYRef.current = paletteY; }, [paletteY]);

  // 矢印キー操作
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setPaletteY((prev) => Math.min(1.0, prev + 0.06));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setPaletteY((prev) => Math.max(0.0, prev - 0.06));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === "suspended") {
      // fire-and-forget: iOS/Safari 経由のスケジューラー等、同期呼び出しでも
      // 呼んでおけば resume が進み始める。確実性が要る箇所は resumeAudioContext を使う。
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  // ユーザー操作（クリック等）のハンドラ内から呼び、resume完了を確実に待つ。
  // Safari/iOS はジェスチャーから離れたタイミングの resume() を無視することがあるため、
  // ジェスチャーハンドラ内で同期的に呼び出した上で await する。
  const resumeAudioContext = useCallback(async () => {
    const ctx = ensureAudioContext();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        // resume が失敗しても後続の再生試行に委ねる
      }
    }
    return ctx;
  }, [ensureAudioContext]);

  const playSingleStringScheduled = useCallback(
    (freq: number, time: number, isAccent: boolean, midiNote: number, delayTicks: number = 0, muted: boolean = false) => {
      const ctx = ensureAudioContext();

      // ヒューマナイズ: 微小なタイミングの揺らぎ（±3ms）。生演奏らしいバラつきを加える。
      const humanizeTimeJitterSec = (Math.random() - 0.5) * 0.006;
      const actualTime = Math.max(ctx.currentTime, time + humanizeTimeJitterSec);

      const duration = muted ? 0.07 : 2.0;

      const master = ctx.createGain();
      const baseVolume = isAccent ? 0.35 : 0.22;
      const volume = muted ? baseVolume * 0.55 : baseVolume;

      master.gain.setValueAtTime(0.0001, actualTime);
      master.gain.linearRampToValueAtTime(volume, actualTime + (muted ? 0.002 : 0.005));
      master.gain.exponentialRampToValueAtTime(0.0001, actualTime + duration);
      master.connect(ctx.destination);

      // ミュートストロークは打楽器的な「チャック」音を短いディケイで表現する
      const partials = muted
        ? [
            { mult: 1, gain: 1.0, type: "triangle" as OscillatorType },
            { mult: 2.4, gain: 0.5, type: "square" as OscillatorType },
          ]
        : [
            { mult: 1, gain: 1.0, type: "sine" as OscillatorType },
            { mult: 2, gain: 0.3, type: "sine" as OscillatorType },
            { mult: 3, gain: 0.15, type: "triangle" as OscillatorType },
          ];

      partials.forEach((p) => {
        const osc = ctx.createOscillator();
        osc.type = p.type;
        osc.frequency.setValueAtTime(freq * p.mult, actualTime);

        const g = ctx.createGain();
        g.gain.setValueAtTime(p.gain, actualTime);
        g.gain.exponentialRampToValueAtTime(0.0001, actualTime + duration);

        osc.connect(g);
        g.connect(master);
        osc.start(actualTime);
        osc.stop(actualTime + duration + 0.05);
      });

      if (isRecordingRef.current) {
        // ヒューマナイズ: 微小なベロシティの揺らぎ（±5）
        const baseVelocity = isAccent ? 95 : 75;
        const velocityJitter = Math.floor((Math.random() - 0.5) * 10);
        const velocity = muted
          ? Math.max(1, Math.min(60, 40 + velocityJitter))
          : Math.max(1, Math.min(127, baseVelocity + velocityJitter));

        const ticksPerSecond = (96 * bpmRef.current) / 60;
        const humanizeTimeJitterTicks = Math.round(humanizeTimeJitterSec * ticksPerSecond);
        const tick = totalTickCounterRef.current + (strokeQuantizeModeRef.current ? 0 : delayTicks + humanizeTimeJitterTicks);
        const noteOffOffset = muted ? 4 : 20;
        setRecordedEvents((prev) => [
          ...prev,
          { ticks: tick, type: "noteOn", channel: 0, note: midiNote, velocity },
          { ticks: tick + noteOffOffset, type: "noteOff", channel: 0, note: midiNote, velocity: 0 },
        ]);
      }
    },
    [ensureAudioContext]
  );

  const playMelodyScheduled = useCallback(
    (freq: number, time: number, midiNote: number) => {
      const ctx = ensureAudioContext();
      const MAX_SUSTAIN_TIME = 3.0;

      if (activeMelodyGainRef.current) {
        const prevGain = activeMelodyGainRef.current;
        prevGain.gain.cancelScheduledValues(time);
        prevGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.015);
      }

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, time);
      master.gain.linearRampToValueAtTime(0.38, time + 0.01);
      master.gain.exponentialRampToValueAtTime(0.0001, time + MAX_SUSTAIN_TIME);
      master.connect(ctx.destination);

      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, time);

      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.setValueAtTime(freq * 2, time);

      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.15, time);

      osc.connect(master);
      osc2.connect(g2);
      g2.connect(master);

      osc.start(time);
      osc2.start(time);
      osc.stop(time + MAX_SUSTAIN_TIME + 0.05);
      osc2.stop(time + MAX_SUSTAIN_TIME + 0.05);

      activeMelodyGainRef.current = master;

      if (isRecordingRef.current) {
        const tick = totalTickCounterRef.current;
        setRecordedEvents((prev) => [
          ...prev,
          { ticks: tick, type: "noteOn", channel: 1, note: midiNote, velocity: 100 },
          { ticks: tick + 22, type: "noteOff", channel: 1, note: midiNote, velocity: 0 },
        ]);
      }
    },
    [ensureAudioContext]
  );

  // 4カウントの「カチ」音。MIDIには記録しない（あくまでプレイヤー向けのガイド音）。
  const playCountInClick = useCallback(
    (time: number, isFirstBeat: boolean) => {
      const ctx = ensureAudioContext();
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(isFirstBeat ? 1760 : 1320, time);

      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, time);
      g.gain.linearRampToValueAtTime(isFirstBeat ? 0.28 : 0.18, time + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);

      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + 0.08);
    },
    [ensureAudioContext]
  );

  const generateRandomMelodyPattern = () => {
    const mask: boolean[] = [];
    const probability = noteDensity / 100;

    for (let i = 0; i < 16; i++) {
      const bonus = i % 4 === 0 ? 0.2 : 0.0;
      mask.push(Math.random() < Math.min(0.95, probability + bonus));
    }

    const newPattern: MelodyPattern = {
      id: "random_custom",
      name: `🎲 カスタム生成 (密度${noteDensity}%)`,
      mask,
    };

    setMelodyPatterns((prev) => {
      const filtered = prev.filter((p) => p.id !== "random_custom");
      return [...filtered, newPattern];
    });
    setSelectedMelodyPatternId("random_custom");
  };

  const getAutoMelodyFreqAndNote = useCallback(
    (chordName: string, yRatio: number, step: number, mask: boolean[]) => {
      const library = getChordLibraryForMode(keyModeRef.current);
      const chord = library.find((c) => c.name === chordName) || library[0];

      let noteDurationSteps = 1;
      for (let i = step + 1; i < step + 16; i++) {
        if (mask[i % 16]) break;
        noteDurationSteps++;
      }
      const isShortNote = noteDurationSteps <= 2;
      const isFirstBeat = step === 0;

      const passingActive = allowPassingTonesRef.current;
      const shortActive = allowOnlyShortNotesRef.current;
      const chordChangeActive = forceChordToneOnChordChangeRef.current;

      let mustBeChordTone = false;

      if (!passingActive && !shortActive) {
        mustBeChordTone = true;
      } else {
        if (chordChangeActive && isFirstBeat) {
          mustBeChordTone = true;
        }
        if (shortActive && !isShortNote) {
          mustBeChordTone = true;
        }
      }

      let availableTones: number[] = [];

      if (mustBeChordTone) {
        availableTones = chord.chordTones;
      } else if (passingActive) {
        availableTones = C_MAJOR_SCALE.filter((tone) => {
          const isTone = chord.chordTones.includes(tone);
          const isAdjacent = chord.chordTones.some((ct) => Math.abs(ct - tone) <= 2 || Math.abs(ct - tone) >= 10);
          return isTone || isAdjacent;
        });
      } else {
        availableTones = C_MAJOR_SCALE;
      }

      const totalTonesCount = availableTones.length * 2;
      let toneIdx = Math.floor(yRatio * totalTonesCount);
      toneIdx = Math.max(0, Math.min(totalTonesCount - 1, toneIdx));

      const octave = Math.floor(toneIdx / availableTones.length) + 4;
      const semitone = availableTones[toneIdx % availableTones.length];

      const midiNote = (octave + 1) * 12 + semitone + keyOffsetRef.current;
      const freq = 261.63 * Math.pow(2, ((octave - 4) * 12 + semitone + keyOffsetRef.current) / 12);

      return { freq, midiNote };
    },
    []
  );

  const scheduleStroke = useCallback(
    (chordName: string, dir: "down" | "up" | "mute", isAccent: boolean, time: number) => {
      const chord = getChordLibraryForMode(keyModeRef.current).find((c) => c.name === chordName);
      if (!chord) return;

      const isMuted = dir === "mute";

      const stringFreqs: { freq: number; midiNote: number }[] = [];
      chord.frets.forEach((fret, stringIdx) => {
        if (fret !== -1) {
          const openFreq = OPEN_STRINGS_FREQ[stringIdx];
          const totalFret = fret + keyOffsetRef.current;
          const freq = openFreq * Math.pow(2, totalFret / 12);

          const midiNote = OPEN_STRING_MIDI[stringIdx] + totalFret;

          stringFreqs.push({ freq, midiNote });
        }
      });

      if (dir === "up") stringFreqs.reverse();

      // ストロークディレイ（弦間のタイミングのズレ）はテンポとストローク種別で変化させる。
      // ・テンポが速いほど16分音符の枠が狭くなるので、スプレッドもそれに合わせて縮む
      //   （次の音符に食い込まないよう、16分音符幅に対する割合で計算する）。
      // ・アップストロークはダウンより手の動きが緩く、やや広がりが出る。
      // ・アクセント（強く弾く）は鋭くタイトになる。ミュートは全弦をほぼ同時にチャックするのでさらにタイト。
      const secondsPerBeat = 60 / bpmRef.current;
      const secondsPer16th = secondsPerBeat / 4;

      const dirSpreadMultiplier = isMuted ? 0.4 : dir === "up" ? 1.25 : 1.0;
      const accentSpreadMultiplier = isAccent ? 0.7 : 1.0;

      const totalSpreadSec = secondsPer16th * 0.35 * dirSpreadMultiplier * accentSpreadMultiplier;
      const stringCount = stringFreqs.length;
      const rawPerStringDelay = stringCount > 1 ? totalSpreadSec / (stringCount - 1) : 0;
      const perStringDelaySec = Math.min(0.04, Math.max(0.004, rawPerStringDelay));

      const ticksPerSecond = (96 * bpmRef.current) / 60;
      stringFreqs.forEach((item, i) => {
        const delaySec = i * perStringDelaySec;
        const delayTicks = Math.round(delaySec * ticksPerSecond);
        playSingleStringScheduled(item.freq, time + delaySec, isAccent, item.midiNote, delayTicks, isMuted);
      });
    },
    [playSingleStringScheduled]
  );

  // アルペジオモード: 指定ステップでON になっている弦だけを、現在のコードのボイシングに従って
  // 指弾き風の微小ディレイを付けながら発音する。
  const scheduleArpeggioStep = useCallback(
    (chordName: string, arpStepIndex: number, time: number) => {
      const chord = getChordLibraryForMode(keyModeRef.current).find((c) => c.name === chordName);
      if (!chord) return;
      const pattern = arpeggioPatternRef.current;

      const activeStrings: number[] = [];
      for (let s = 0; s < 6; s++) {
        if (pattern.grid[s]?.[arpStepIndex]) activeStrings.push(s);
      }
      if (activeStrings.length === 0) return;

      const secondsPerBeat = 60 / bpmRef.current;
      const secondsPer16th = secondsPerBeat / 4;
      const perNoteDelaySec = Math.min(0.03, secondsPer16th * 0.2);
      const ticksPerSecond = (96 * bpmRef.current) / 60;

      activeStrings.forEach((stringIdx, i) => {
        const fret = chord.frets[stringIdx];
        if (fret === -1) return; // このボイシングでミュートされている弦は発音不可
        const totalFret = fret + keyOffsetRef.current;
        const freq = OPEN_STRINGS_FREQ[stringIdx] * Math.pow(2, totalFret / 12);
        const midiNote = OPEN_STRING_MIDI[stringIdx] + totalFret;
        const delaySec = i * perNoteDelaySec;
        const delayTicks = Math.round(delaySec * ticksPerSecond);
        playSingleStringScheduled(freq, time + delaySec, false, midiNote, delayTicks, false);
      });
    },
    [playSingleStringScheduled]
  );

  const scheduler = useCallback(() => {
    const ctx = ensureAudioContext();
    const lookahead = 0.1;

    while (nextNoteTimeRef.current < ctx.currentTime + lookahead) {
      // カウントイン中は無音で4拍分だけ進め、コード/メロディは一切鳴らさない・録音もしない
      if (isCountingInRef.current) {
        const remaining = countInRemainingStepsRef.current;
        if (remaining % 4 === 0) {
          const beatsLeft = remaining / 4;
          setCountInBeatsLeft(beatsLeft);
          playCountInClick(nextNoteTimeRef.current, beatsLeft === 4);
        }

        const secondsPerBeatCountIn = 60.0 / bpmRef.current;
        const secondsPer16thCountIn = secondsPerBeatCountIn / 4.0;
        nextNoteTimeRef.current += secondsPer16thCountIn;
        countInRemainingStepsRef.current -= 1;

        if (countInRemainingStepsRef.current <= 0) {
          isCountingInRef.current = false;
          setIsCountingIn(false);
          isRecordingRef.current = true;
          setIsRecording(true);
          currentLocalStepRef.current = 0;
          currentBlockIndexRef.current = 0;
          totalTickCounterRef.current = 0;
        }
        continue;
      }

      const melodyPattern = melodyPatternsRef.current.find((p) => p.id === selectedMelodyPatternIdRef.current) || melodyPatternsRef.current[0];

      const block = progressionRef.current[currentBlockIndexRef.current];
      const stepsInBlock = Math.max(1, block.beats * 4);
      // patternIndex は「標準4拍・16分音符グリッド」上の絶対位置（0-15）。BPMに対する
      // 16分音符の実時間（secondsPer16th）は拍数に関係なく常に一定なので、これでグリッド速度が
      // 常に固定される。
      // ・ブロックが4拍未満（圧縮）: stepsInBlockに達した時点で次のブロックへ切り替わるため、
      //   自動的にパターンの前半だけが再生される「切り詰め」になる（速度は変わらない）。
      // ・ブロックが4拍超（伸長, 8拍）: patternIndexが0-15を2周するので、標準パターンが
      //   同じ速度のままもう一度繰り返される。
      const patternIndex = currentLocalStepRef.current % 16;
      const chord = block.chord;

      if (playModeRef.current === "stroke") {
        const strokeAction = activeStrokeActionsRef.current[patternIndex];
        if (strokeAction && strokeAction.dir !== "none") {
          scheduleStroke(chord, strokeAction.dir, !!strokeAction.accent, nextNoteTimeRef.current);
        }
      } else {
        const pattern = arpeggioPatternRef.current;
        const window = 16 / pattern.steps;
        if (patternIndex % window === 0) {
          const arpStepIndex = Math.floor(patternIndex / window);
          scheduleArpeggioStep(chord, arpStepIndex, nextNoteTimeRef.current);
        }
      }

      if (melodyEnabledRef.current && melodyPattern.mask[patternIndex]) {
        const { freq, midiNote } = getAutoMelodyFreqAndNote(chord, paletteYRef.current, patternIndex, melodyPattern.mask);
        playMelodyScheduled(freq, nextNoteTimeRef.current, midiNote);
      }

      const s = patternIndex;
      const b = currentBlockIndexRef.current;
      setTimeout(() => {
        setCurrentStep(s);
        setCurrentBar(b);
      }, (nextNoteTimeRef.current - ctx.currentTime) * 1000);

      const secondsPerBeat = 60.0 / bpmRef.current;
      const secondsPer16th = secondsPerBeat / 4.0;

      nextNoteTimeRef.current += secondsPer16th;
      totalTickCounterRef.current += 24;

      currentLocalStepRef.current++;
      if (currentLocalStepRef.current >= stepsInBlock) {
        currentLocalStepRef.current = 0;
        currentBlockIndexRef.current = (currentBlockIndexRef.current + 1) % progressionRef.current.length;
      }
    }

    if (isPlayingRef.current) {
      timerIdRef.current = window.setTimeout(scheduler, 25);
    }
  }, [ensureAudioContext, scheduleStroke, scheduleArpeggioStep, getAutoMelodyFreqAndNote, playMelodyScheduled, playCountInClick]);

  // 再生・カウントイン・録音をすべて止めて無音の状態に戻す
  const stopAll = useCallback(() => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    isCountingInRef.current = false;
    setIsCountingIn(false);
    isRecordingRef.current = false;
    setIsRecording(false);
    if (timerIdRef.current) {
      clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }
    setCurrentStep(-1);
  }, []);

  const togglePlay = () => {
    if (isPlaying) {
      stopAll();
      return;
    }

    // クリックのユーザージェスチャー内で同期的に resume を発火しておく（Safari対策）。
    // その上でawaitし、実際にrunning状態になってからスケジューラーを開始する。
    isPlayingRef.current = true;
    setIsPlaying(true);

    resumeAudioContext().then((ctx) => {
      // resume 待ちの間に停止ボタンが押されていたら再生開始をキャンセル
      if (!isPlayingRef.current) return;

      currentLocalStepRef.current = 0;
      currentBlockIndexRef.current = 0;
      totalTickCounterRef.current = 0;
      nextNoteTimeRef.current = ctx.currentTime + 0.05;
      scheduler();
    });
  };

  // 「録音開始」: 再生中なら一旦音を止め、4カウント（無音＋クリック音）を置いてから
  // 設定したコード進行の1つ目（小節1・ステップ0）から録音つきで再生を始める。
  const startRecordingFlow = () => {
    // すでに何か鳴っていれば即座に止める
    isPlayingRef.current = false;
    isCountingInRef.current = false;
    isRecordingRef.current = false;
    if (timerIdRef.current) {
      clearTimeout(timerIdRef.current);
      timerIdRef.current = null;
    }
    setIsRecording(false);
    setIsCountingIn(false);
    setCurrentStep(-1);
    setRecordedEvents([]);

    isPlayingRef.current = true;
    setIsPlaying(true);

    resumeAudioContext().then((ctx) => {
      if (!isPlayingRef.current) return;

      currentLocalStepRef.current = 0;
      currentBlockIndexRef.current = 0;
      totalTickCounterRef.current = 0;
      countInRemainingStepsRef.current = 16; // 4拍分 = 16分音符16ステップ
      setCountInBeatsLeft(4);
      isCountingInRef.current = true;
      setIsCountingIn(true);
      nextNoteTimeRef.current = ctx.currentTime + 0.05;
      scheduler();
    });
  };

  const toggleRecording = () => {
    if (isRecording || isCountingIn) {
      stopAll();
    } else {
      startRecordingFlow();
    }
  };

  // Logic Pro 100% 動作保証 MIDIファイルダウンロード
  const downloadMidiFile = () => {
    if (recordedEvents.length === 0) {
      alert("録音データがありません。「録音開始」を押してフレーズを記録してください！");
      return;
    }

    const smfArray = buildLogicProPerfectSMF(recordedEvents, bpm);
    const arrayBuffer = smfArray.buffer.slice(smfArray.byteOffset, smfArray.byteOffset + smfArray.byteLength) as ArrayBuffer;
    const blob = new Blob([arrayBuffer], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "guitar-composition.mid";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleChordChange = (index: number, newChord: string) => {
    setProgression((prev) => prev.map((b, i) => (i === index ? { ...b, chord: newChord } : b)));
    setLastCadenceResult(null);
  };

  const handleBeatsChange = (index: number, beats: BlockBeats) => {
    setProgression((prev) => prev.map((b, i) => (i === index ? { ...b, beats } : b)));
  };

  const setAllBeats = (beats: BlockBeats) => {
    setProgression((prev) => prev.map((b) => ({ ...b, beats })));
  };

  // 前後（ループも含む）のベース音の関係を判定: "same"=同音(ペダル) / "step"=半音・全音の順次進行
  const smoothBassInfo = useMemo(() => {
    const n = progression.length;
    if (n === 0) return [] as ("same" | "step" | null)[];
    const bassNotes = progression.map((block) => {
      const chord = activeChordLibrary.find((c) => c.name === block.chord);
      return chord ? getChordBassMidiNote(chord) : 0;
    });
    const outgoingRelation = bassNotes.map((note, i): "same" | "step" | null => {
      if (n <= 1) return null;
      const nextNote = bassNotes[(i + 1) % n];
      const diff = Math.abs(nextNote - note);
      if (diff === 0) return "same";
      if (diff === 1 || diff === 2) return "step";
      return null;
    });
    return bassNotes.map((_, i) => outgoingRelation[i] ?? outgoingRelation[(i - 1 + n) % n]);
  }, [progression, activeChordLibrary]);

  const updatePaletteY = (clientY: number, rect: DOMRect) => {
    const y = clientY - rect.top;
    const ratio = 1.0 - Math.max(0, Math.min(1, y / rect.height));
    setPaletteY(ratio);
  };

  // ストロークのステップをクリック: none→down→up→mute を巡回
  const cycleStrokeStep = (index: number) => {
    setCustomStrokeActions((prev) => {
      const base = (prev ?? activeStrokeActions).map((a) => ({ ...a }));
      const current = base[index].dir;
      const nextDir = STROKE_DIR_CYCLE[(STROKE_DIR_CYCLE.indexOf(current) + 1) % STROKE_DIR_CYCLE.length];
      base[index] = { dir: nextDir, accent: nextDir === "down" || nextDir === "up" ? base[index].accent : false };
      return base;
    });
  };

  const toggleStrokeAccent = (index: number) => {
    setCustomStrokeActions((prev) => {
      const base = (prev ?? activeStrokeActions).map((a) => ({ ...a }));
      base[index] = { ...base[index], accent: !base[index].accent };
      return base;
    });
  };

  const applyStrokePreset = (presetId: string) => {
    setSelectedPatternId(presetId);
    setCustomStrokeActions(null);
  };

  const toggleArpeggioCell = (stringIdx: number, stepIdx: number) => {
    setArpeggioPattern((prev) => {
      const grid = prev.grid.map((row) => [...row]);
      grid[stringIdx][stepIdx] = !grid[stringIdx][stepIdx];
      return { ...prev, id: "custom", name: "カスタム", grid };
    });
  };

  // ============================================================
  // クラウドプリセット（Supabase）
  // ============================================================
  const showToast = useCallback((type: "success" | "error", message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ type, message });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  const fetchCloudPresets = useCallback(async () => {
    setIsLoadingPresets(true);
    try {
      const { data, error } = await supabase
        .from("presets")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCloudPresets((data as CloudPreset[] | null) ?? []);
    } catch (e) {
      showToast("error", `プリセット一覧の取得に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsLoadingPresets(false);
    }
  }, [showToast]);

  // 初回マウント時に一覧を取得（エフェクト本体から直接setStateすると
  // カスケードレンダーになるため、マイクロタスクにずらして呼び出す）
  useEffect(() => {
    Promise.resolve().then(() => fetchCloudPresets());
  }, [fetchCloudPresets]);

  const savePresetToCloud = async (name: string) => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showToast("error", "プリセット名を入力してください");
      return;
    }

    setIsSavingPreset(true);
    try {
      // key_mode列がスキーマに無いため、短調は "Am" のように末尾"m"付きの表記で key_name に
      // エンコードする（読み込み時に末尾"m"の有無で長調/短調を判定）
      const payload: NewCloudPreset = {
        name: trimmedName,
        bpm,
        key_name: keyMode === "major" ? KEY_OFFSET_NAMES[keyOffset] : MINOR_KEY_NAMES[keyOffset],
        play_mode: playMode,
        stroke_pattern: playMode === "stroke" ? JSON.stringify(activeStrokeActions) : null,
        arpeggio_pattern: playMode === "arpeggio" ? (arpeggioPattern as unknown as Record<string, unknown>) : null,
        chords: progression.map((b) => ({ chord: b.chord, beats: b.beats })),
      };

      const { error } = await supabase.from("presets").insert(payload);
      if (error) throw error;

      showToast("success", `「${trimmedName}」をクラウドに保存しました`);
      setIsSaveModalOpen(false);
      setSaveNameInput("");
      fetchCloudPresets();
    } catch (e) {
      showToast("error", `保存に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsSavingPreset(false);
    }
  };

  const loadCloudPreset = (preset: CloudPreset) => {
    setBpm(preset.bpm);
    const isMinorKey = preset.key_name.endsWith("m");
    const keyNames = isMinorKey ? MINOR_KEY_NAMES : KEY_OFFSET_NAMES;
    const keyIdx = keyNames.indexOf(preset.key_name);
    setKeyMode(isMinorKey ? "minor" : "major");
    setKeyOffset(keyIdx >= 0 ? keyIdx : 0);
    setPlayMode(preset.play_mode);
    setLastCadenceResult(null);
    setProgression(
      (preset.chords ?? []).map((c) => createProgressionBlock(c.chord, (c.beats as BlockBeats) ?? 4))
    );

    if (preset.play_mode === "stroke") {
      if (preset.stroke_pattern) {
        try {
          const actions = JSON.parse(preset.stroke_pattern) as StrokeAction[];
          setCustomStrokeActions(actions);
        } catch {
          showToast("error", "ストロークパターンの読み込みに失敗しました（データ形式不正）");
        }
      } else {
        setCustomStrokeActions(null);
      }
    } else if (preset.arpeggio_pattern) {
      setArpeggioPattern(preset.arpeggio_pattern as unknown as ArpeggioPattern);
    }

    setIsPresetLibraryOpen(false);
    showToast("success", `プリセット「${preset.name}」を読み込みました`);
  };

  const deleteCloudPreset = async (preset: CloudPreset) => {
    if (!window.confirm(`プリセット「${preset.name}」をクラウドから削除しますか？この操作は取り消せません。`)) return;

    setDeletingPresetId(preset.id);
    try {
      const { error } = await supabase.from("presets").delete().eq("id", preset.id);
      if (error) throw error;
      showToast("success", `「${preset.name}」を削除しました`);
      setCloudPresets((prev) => prev.filter((p) => p.id !== preset.id));
    } catch (e) {
      showToast("error", `削除に失敗しました: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeletingPresetId(null);
    }
  };

  const hasAnyFilterOn = allowPassingTones || allowOnlyShortNotes;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 select-none">
      {/* 常に画面上部に固定される操作バー */}
      <div className="sticky top-0 z-30 bg-stone-950/95 backdrop-blur border-b border-stone-800 px-4 sm:px-6 py-3">
        <div className="w-full max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Music className="w-6 h-6 text-amber-400 shrink-0" />
            <h1 className="text-lg sm:text-xl font-bold tracking-wide">ギター作曲アシスタント</h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-center">
            {/* 再生/停止ボタン */}
            <button
              onClick={togglePlay}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-colors shadow-lg ${
                isPlaying
                  ? "bg-rose-500 hover:bg-rose-400 text-white"
                  : "bg-amber-500 hover:bg-amber-400 text-stone-950"
              }`}
            >
              {isPlaying ? (
                <>
                  <Square className="w-5 h-5 fill-current" />
                  <span>停止</span>
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 fill-current" />
                  <span>再生</span>
                </>
              )}
            </button>

            {/* 録音ボタン */}
            <button
              onClick={toggleRecording}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md ${
                isRecording
                  ? "bg-rose-600 text-white animate-pulse shadow-rose-900/50"
                  : isCountingIn
                  ? "bg-amber-600 text-white animate-pulse shadow-amber-900/50"
                  : "bg-stone-800 border border-stone-700 text-rose-400 hover:bg-stone-700"
              }`}
            >
              <Disc className="w-4 h-4" />
              <span>
                {isRecording
                  ? "録音中 (停止)"
                  : isCountingIn
                  ? `カウント中… ${countInBeatsLeft}`
                  : "録音開始"}
              </span>
            </button>

            {/* MIDIダウンロードボタン */}
            <button
              onClick={downloadMidiFile}
              disabled={recordedEvents.length === 0}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs border border-emerald-500/50 text-emerald-300 bg-emerald-950/30 hover:bg-emerald-900/50 disabled:opacity-40 disabled:border-stone-800 transition-all shadow-md"
            >
              <Download className="w-4 h-4" />
              <span>MIDI出力</span>
            </button>

            {/* クラウド保存ボタン */}
            <button
              onClick={() => setIsSaveModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs border border-sky-500/50 text-sky-300 bg-sky-950/30 hover:bg-sky-900/50 transition-all shadow-md"
            >
              <CloudUpload className="w-4 h-4" />
              <span>クラウドに保存</span>
            </button>

            {/* クラウドプリセット一覧ボタン */}
            <button
              onClick={() => {
                setIsPresetLibraryOpen(true);
                fetchCloudPresets();
              }}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs border border-sky-500/50 text-sky-300 bg-sky-950/30 hover:bg-sky-900/50 transition-all shadow-md"
            >
              {isLoadingPresets ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
              <span>クラウドプリセット一覧{cloudPresets.length > 0 ? ` (${cloudPresets.length})` : ""}</span>
            </button>

            {/* ヘルプボタン */}
            <button
              onClick={() => setIsHelpOpen(true)}
              aria-label="使い方・和声理論の解説を開く"
              className="flex items-center justify-center w-9 h-9 rounded-full border border-stone-700 bg-stone-800 text-stone-300 hover:bg-stone-700 hover:text-amber-300 transition-all shadow-md"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* トースト通知 */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] max-w-[90vw]">
          <div
            className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl border text-xs font-bold ${
              toast.type === "success"
                ? "bg-emerald-950 border-emerald-500/60 text-emerald-300"
                : "bg-rose-950 border-rose-500/60 text-rose-300"
            }`}
          >
            {toast.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* クラウド保存モーダル */}
      {isSaveModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => !isSavingPreset && setIsSaveModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold flex items-center gap-2">
                <CloudUpload className="w-5 h-5 text-sky-400" />
                クラウドに保存
              </h2>
              <button
                onClick={() => setIsSaveModalOpen(false)}
                disabled={isSavingPreset}
                aria-label="閉じる"
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-800 text-stone-400 hover:text-white transition-colors disabled:opacity-40"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-[11px] text-stone-400 leading-relaxed">
              現在のBPM・キー・演奏モード・コード進行（拍数含む）・{playMode === "stroke" ? "ストロークパターン" : "アルペジオパターン"}
              をまとめてクラウドに保存します。
            </p>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-stone-500">プリセット名</label>
              <input
                type="text"
                value={saveNameInput}
                onChange={(e) => setSaveNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isSavingPreset) savePresetToCloud(saveNameInput);
                }}
                placeholder="例: サビ用 王道進行"
                autoFocus
                className="w-full bg-stone-950 border border-stone-700 text-sm py-2 px-3 rounded-xl text-stone-100 outline-none focus:border-sky-500"
              />
            </div>

            <button
              onClick={() => savePresetToCloud(saveNameInput)}
              disabled={isSavingPreset || saveNameInput.trim().length === 0}
              className="w-full flex items-center justify-center gap-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:hover:bg-sky-500 text-stone-950 font-bold py-2.5 rounded-xl transition-colors text-xs"
            >
              {isSavingPreset ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudUpload className="w-4 h-4" />}
              {isSavingPreset ? "保存中…" : "保存する"}
            </button>
          </div>
        </div>
      )}

      {/* クラウドプリセット一覧モーダル */}
      {isPresetLibraryOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setIsPresetLibraryOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[80vh] overflow-y-auto bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold flex items-center gap-2">
                <Cloud className="w-5 h-5 text-sky-400" />
                クラウドプリセット一覧
              </h2>
              <button
                onClick={() => setIsPresetLibraryOpen(false)}
                aria-label="閉じる"
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-800 text-stone-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isLoadingPresets ? (
              <div className="flex items-center justify-center gap-2 text-stone-400 text-xs py-8">
                <Loader2 className="w-4 h-4 animate-spin" />
                読み込み中…
              </div>
            ) : cloudPresets.length === 0 ? (
              <div className="text-center text-stone-500 text-xs py-8">
                保存されたプリセットはまだありません。「クラウドに保存」から作成できます。
              </div>
            ) : (
              <div className="space-y-2">
                {cloudPresets.map((preset) => (
                  <div
                    key={preset.id}
                    className="flex items-center gap-2 bg-stone-950 border border-stone-800 rounded-xl p-3 hover:border-sky-500/50 transition-all"
                  >
                    <button onClick={() => loadCloudPreset(preset)} className="flex-1 text-left min-w-0">
                      <div className="text-sm font-bold text-sky-300 truncate">{preset.name}</div>
                      <div className="text-[10px] text-stone-500 font-mono truncate">
                        BPM {preset.bpm} / Key {preset.key_name} / {preset.play_mode === "stroke" ? "ストローク" : "アルペジオ"} /{" "}
                        {(preset.chords ?? []).map((c) => c.chord).join("-")}
                      </div>
                      <div className="text-[9px] text-stone-600 mt-0.5">
                        {new Date(preset.created_at).toLocaleString("ja-JP")}
                      </div>
                    </button>
                    <button
                      onClick={() => deleteCloudPreset(preset)}
                      disabled={deletingPresetId === preset.id}
                      aria-label={`${preset.name} を削除`}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-stone-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors disabled:opacity-40 shrink-0"
                    >
                      {deletingPresetId === preset.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 画面解説モーダル */}
      {isHelpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setIsHelpOpen(false)}
        >
          <div
            className="w-full max-w-lg max-h-[85vh] overflow-y-auto bg-stone-900 border border-stone-700 rounded-2xl shadow-2xl p-5 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-amber-400" />
                コード進行エディタの見かた
              </h2>
              <button
                onClick={() => setIsHelpOpen(false)}
                aria-label="閉じる"
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-stone-800 text-stone-400 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-stone-300 leading-relaxed">
              <h3 className="font-bold text-amber-300 flex items-center gap-1.5">
                <Music2 className="w-3.5 h-3.5" /> 和声リズムの考え方
              </h3>
              <p>
                コードが変わる頻度そのものが音楽の「動き」を作ります。同じコードが長く続く（拍数が多い）ほど響きは停滞・安定し、
                短い間隔で頻繁に変わるほど推進力が生まれます。STEP2の「和声リズム」で各ブロックの長さ（拍数）を調整すると、
                サビ前は倍速で畳みかけたり、決めのコードだけ倍長で伸ばしたりといった演出ができます。
              </p>

              <h3 className="font-bold text-amber-300 flex items-center gap-1.5 pt-1">
                <Sparkles className="w-3.5 h-3.5" /> 機能和声（T / SD / D）の役割
              </h3>
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className={`mt-0.5 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${FUNCTION_BADGE_STYLES.T.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${FUNCTION_BADGE_STYLES.T.dot}`} />T
                  </span>
                  <span><b>トニック（青）</b>: 曲の「家」にあたる最も安定したコード。フレーズの始まりや終わりに使われます。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className={`mt-0.5 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${FUNCTION_BADGE_STYLES.SD.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${FUNCTION_BADGE_STYLES.SD.dot}`} />SD
                  </span>
                  <span><b>サブドミナント（黄緑）</b>: トニックから一歩離れた「展開」のコード。トニックにもドミナントにも進める橋渡し役。</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className={`mt-0.5 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${FUNCTION_BADGE_STYLES.D.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${FUNCTION_BADGE_STYLES.D.dot}`} />D
                  </span>
                  <span><b>ドミナント（オレンジ）</b>: 強い緊張と「解決したい」推進力を持つコード。トニックに戻ることで気持ちよく着地します。</span>
                </li>
              </ul>

              <h3 className="font-bold text-amber-300 flex items-center gap-1.5 pt-1">
                <Music4 className="w-3.5 h-3.5" /> 分数コード（オンコード）のメリット
              </h3>
              <p>
                G/B や C/E のように「分子のコード / ベース音」で表される分数コードは、コードの響きはそのままに
                ベース音だけを滑らかに繋げるためのテクニックです。ベースラインが階段状に動くことで、単純なコードの
                並びよりも滑らかで浮遊感のある印象を作れます（例: C → G/B → Am で「ド→シ→ラ」と滑らかに下降）。
              </p>

              <h3 className="font-bold text-amber-300 flex items-center gap-1.5 pt-1">
                <Sparkle className="w-3.5 h-3.5" /> 「✨ スムーズベース」「🔁 ベース同音」下線の意味
              </h3>
              <p>
                隣り合う（ループ時は最後→最初も含む）コードの最低音（ベース音）の差が半音〜全音（1〜2半音）のときは
                「✨ スムーズベース」、ベース音がまったく同じ（ペダルポイント）のときは「🔁 ベース同音」という
                波線付きの表示が自動的に出ます。どちらもベースラインが滑らかに（あるいはどっしりと）繋がっている
                証拠なので、分数コードを組み合わせる際の目安として活用してください。
              </p>

              <h3 className="font-bold text-amber-300 flex items-center gap-1.5 pt-1">
                <Music2 className="w-3.5 h-3.5" /> 短調（マイナーキー）の和音について
              </h3>
              <p>
                短調には3種類の音階があります。<b>自然短音階</b>はキー音から半音を含まない素直な並びで、
                Em7（Vm7）のような穏やかなドミナントが得られます。<b>和声短音階</b>は7番目の音を半音上げたもので、
                これにより E7（V7）という力強い長三和音のドミナントが生まれ、トニックマイナー（Im）へ強い
                解決感を持って進行できます（なぜマイナーキーなのにE7のような長三和音が使えるかは、この
                「導音を半音上げて緊張を作る」和声短音階の仕組みによるものです）。<b>旋律短音階</b>は
                上行時に6番目・7番目の音も半音上げる形で、なめらかなメロディラインに使われます。
              </p>
              <p>
                <b>マイナーツーファイブワン</b>（IIm7b5 → V7 → Im、例: Bm7b5 → E7 → Am7）は、長調のツーファイブワンの
                短調版です。IIm7b5（半減7）が展開を作り、V7（和声短音階由来の強いドミナント）が緊張を最大化し、
                Im（Im7）で解決する——という、短調でもっとも定番かつ実用的な進行です。
              </p>
            </div>

            <button
              onClick={() => setIsHelpOpen(false)}
              className="w-full bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold py-2.5 rounded-xl transition-colors text-xs"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {/* コントロールパネル */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-stone-900 border border-stone-800 p-4 rounded-2xl">
          <div className="flex items-center gap-4">
            <Sliders className="w-5 h-5 text-stone-400" />
            <div className="flex-1">
              <div className="flex justify-between text-xs font-bold mb-1">
                <span>TEMPO (BPM)</span>
                <span className="text-amber-400 font-mono">{bpm}</span>
              </div>
              <input
                type="range"
                min="60"
                max="180"
                value={bpm}
                onChange={(e) => setBpm(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Repeat className="w-5 h-5 text-stone-400" />
            <div className="flex-1 space-y-1.5">
              <div className="flex justify-between text-xs font-bold mb-1">
                <span>KEY / 移調</span>
                <span className="text-amber-400 font-mono">
                  {keyMode === "major" ? KEY_OFFSET_NAMES[keyOffset] : MINOR_KEY_NAMES[keyOffset]}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => {
                    setKeyMode("major");
                    setLastCadenceResult(null);
                  }}
                  className={`py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                    keyMode === "major"
                      ? "bg-sky-500/20 border-sky-400 text-sky-300"
                      : "bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-600"
                  }`}
                >
                  メジャー（長調）
                </button>
                <button
                  onClick={() => {
                    setKeyMode("minor");
                    setLastCadenceResult(null);
                  }}
                  className={`py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                    keyMode === "minor"
                      ? "bg-indigo-500/20 border-indigo-400 text-indigo-300"
                      : "bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-600"
                  }`}
                >
                  マイナー（短調）
                </button>
              </div>

              <select
                value={keyOffset}
                onChange={(e) => setKeyOffset(parseInt(e.target.value, 10))}
                className="w-full bg-stone-800 border border-stone-700 text-xs font-bold py-1.5 px-3 rounded-lg text-amber-300 outline-none"
              >
                {(keyMode === "major" ? KEY_OFFSET_NAMES : MINOR_KEY_NAMES).map((name, i) => (
                  <option key={i} value={i}>
                    Key {name} {i === 0 ? `(原曲キー ${keyMode === "major" ? "C" : "Am"})` : `(+${i} Capo)`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* STEP 1: 演奏スタイル */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-stone-400 tracking-wider">
            STEP 1: 演奏スタイルを選択
          </label>

          {/* 演奏モード切り替え */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setPlayMode("stroke")}
              className={`p-2.5 rounded-xl text-center border font-bold text-xs transition-all ${
                playMode === "stroke"
                  ? "bg-amber-500/20 border-amber-400 text-amber-300"
                  : "bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700"
              }`}
            >
              🎸 ストロークモード
            </button>
            <button
              onClick={() => setPlayMode("arpeggio")}
              className={`p-2.5 rounded-xl text-center border font-bold text-xs transition-all ${
                playMode === "arpeggio"
                  ? "bg-amber-500/20 border-amber-400 text-amber-300"
                  : "bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700"
              }`}
            >
              🎼 アルペジオモード
            </button>
          </div>

          {playMode === "stroke" ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STROKE_PATTERNS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyStrokePreset(p.id)}
                    className={`p-2.5 rounded-xl text-left border transition-all ${
                      selectedPatternId === p.id && !customStrokeActions
                        ? "bg-amber-500/10 border-amber-500 text-amber-300"
                        : "bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700"
                    }`}
                  >
                    <div className="text-xs font-bold">{p.name}</div>
                  </button>
                ))}
              </div>

              {/* 16ステップ・ストロークエディタ */}
              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3 space-y-1">
                <div className="text-[10px] font-bold text-stone-500">
                  ステップをクリックで 休符→↓→↑→ミュート を切替。↓/↑の下の「accent」でアクセントON/OFF。
                  {customStrokeActions && <span className="text-amber-400"> （カスタム編集中）</span>}
                </div>
                <div className="grid grid-cols-8 sm:grid-cols-16 gap-1">
                  {activeStrokeActions.map((action, i) => (
                    <div key={i} className="flex flex-col items-center gap-0.5">
                      <button
                        onClick={() => cycleStrokeStep(i)}
                        className={`w-full aspect-square rounded-lg border text-sm font-bold flex items-center justify-center transition-all ${
                          action.dir === "down"
                            ? `bg-amber-500/20 border-amber-400 text-amber-300 ${action.accent ? "ring-1 ring-amber-300" : ""}`
                            : action.dir === "up"
                            ? `bg-emerald-500/20 border-emerald-400 text-emerald-300 ${action.accent ? "ring-1 ring-emerald-300" : ""}`
                            : action.dir === "mute"
                            ? "bg-rose-500/20 border-rose-400 text-rose-300"
                            : "bg-stone-900 border-stone-800 text-stone-600"
                        }`}
                      >
                        {action.dir === "down" ? "↓" : action.dir === "up" ? "↑" : action.dir === "mute" ? "✕" : "・"}
                      </button>
                      <button
                        onClick={() => toggleStrokeAccent(i)}
                        className={`text-[8px] leading-none h-3 ${
                          action.dir === "down" || action.dir === "up"
                            ? action.accent
                              ? "text-amber-300 font-bold"
                              : "text-stone-600"
                            : "invisible"
                        }`}
                      >
                        accent
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => setStrokeQuantizeMode(false)}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    !strokeQuantizeMode
                      ? "bg-amber-500/10 border-amber-500 text-amber-300"
                      : "bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700"
                  }`}
                >
                  <div className="text-xs font-bold">🎸 生ストローク (MIDIに時間差を記録)</div>
                  <div className="text-[10px] text-stone-400 font-normal">弦ごとのタイミングのズレをそのまま記録。ギターらしい質感。</div>
                </button>
                <button
                  onClick={() => setStrokeQuantizeMode(true)}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    strokeQuantizeMode
                      ? "bg-amber-500/10 border-amber-500 text-amber-300"
                      : "bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700"
                  }`}
                >
                  <div className="text-xs font-bold">📐 クオンタイズ (全弦を同時刻に記録)</div>
                  <div className="text-[10px] text-stone-400 font-normal">ストロークの全弦を1拍に揃えて記録。打ち込み向け。</div>
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {ARPEGGIO_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setArpeggioPattern(cloneArpeggioPattern(preset))}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                      arpeggioPattern.id === preset.id
                        ? "bg-amber-500/10 border-amber-500 text-amber-300"
                        : "border-stone-800 bg-stone-900 text-stone-300 hover:border-amber-500 hover:text-amber-300"
                    }`}
                  >
                    {preset.name}
                  </button>
                ))}
                <button
                  onClick={() => setArpeggioPattern((prev) => resizeArpeggioGrid(prev, prev.steps === 16 ? 8 : 16))}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-stone-700 bg-stone-800 text-stone-300 hover:border-amber-500 hover:text-amber-300 transition-all"
                >
                  グリッド: {arpeggioPattern.steps}ステップ（切替）
                </button>
              </div>

              <div className="bg-stone-950 border border-stone-800 rounded-xl p-3 space-y-1 overflow-x-auto">
                <div className="text-[10px] font-bold text-stone-500 mb-1">
                  セルをクリックしてON/OFF。押さえているコードのボイシングから実際の音程を自動で発音します。
                </div>
                <div className="inline-block min-w-full">
                  {[5, 4, 3, 2, 1, 0].map((stringIdx) => (
                    <div key={stringIdx} className="flex items-center gap-1.5 mb-1">
                      <span className="w-9 text-[10px] font-mono text-stone-400 shrink-0">{6 - stringIdx}弦</span>
                      <div className="flex gap-1">
                        {Array.from({ length: arpeggioPattern.steps }).map((_, stepIdx) => (
                          <button
                            key={stepIdx}
                            onClick={() => toggleArpeggioCell(stringIdx, stepIdx)}
                            className={`w-6 h-6 rounded border transition-all ${
                              arpeggioPattern.grid[stringIdx][stepIdx]
                                ? "bg-amber-500 border-amber-400"
                                : "bg-stone-900 border-stone-800 hover:border-stone-600"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button
                  onClick={() => setStrokeQuantizeMode(false)}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    !strokeQuantizeMode
                      ? "bg-amber-500/10 border-amber-500 text-amber-300"
                      : "bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700"
                  }`}
                >
                  <div className="text-xs font-bold">🎸 生演奏 (MIDIに時間差を記録)</div>
                  <div className="text-[10px] text-stone-400 font-normal">指弾きのタイミングのズレをそのまま記録。</div>
                </button>
                <button
                  onClick={() => setStrokeQuantizeMode(true)}
                  className={`p-2.5 rounded-xl text-left border transition-all ${
                    strokeQuantizeMode
                      ? "bg-amber-500/10 border-amber-500 text-amber-300"
                      : "bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700"
                  }`}
                >
                  <div className="text-xs font-bold">📐 クオンタイズ (グリッドに揃えて記録)</div>
                  <div className="text-[10px] text-stone-400 font-normal">打ち込み向け。</div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* STEP 2: コード進行 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-bold text-stone-400 tracking-wider">
              STEP 2: コード進行を作成（{progression.length}ブロック）
            </label>
          </div>

          {/* カデンツ（終止形）理論エンジンによるランダム生成（長調のみ） */}
          {keyMode === "major" && (
            <div className="flex flex-wrap gap-2">
              {CADENCE_MOOD_OPTIONS.map((mood) => (
                <button
                  key={mood.id}
                  onClick={() => {
                    const result = generateCadenceProgression(mood.id);
                    setProgression(result.chords.map((chord, i) => createProgressionBlock(chord, result.beats[i])));
                    setLastCadenceResult(result);
                  }}
                  className={`flex items-center gap-1.5 font-bold px-3 py-2 rounded-xl shadow-md transition-colors text-xs whitespace-nowrap ${
                    mood.id === "auto"
                      ? "bg-amber-500 hover:bg-amber-400 text-stone-950"
                      : "border border-amber-500/40 bg-stone-900 text-amber-300 hover:bg-amber-500/10"
                  }`}
                >
                  {mood.label}
                </button>
              ))}
            </div>
          )}

          {/* 短調カデンツ・パターン（マイナーキー時のみ） */}
          {keyMode === "minor" && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  const randomPattern = MINOR_CADENCE_PATTERNS[Math.floor(Math.random() * MINOR_CADENCE_PATTERNS.length)];
                  const result = generateMinorCadenceProgression(randomPattern.id);
                  setSelectedMinorPatternId(randomPattern.id);
                  setProgression(result.chords.map((chord, i) => createProgressionBlock(chord, result.beats[i])));
                  setLastCadenceResult(result);
                }}
                className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold px-3 py-2 rounded-xl shadow-md transition-colors text-xs whitespace-nowrap"
              >
                🎲 おまかせ短調進行
              </button>
              {MINOR_CADENCE_PATTERNS.map((pattern) => (
                <button
                  key={pattern.id}
                  onClick={() => {
                    const result = generateMinorCadenceProgression(pattern.id);
                    setSelectedMinorPatternId(pattern.id);
                    setProgression(result.chords.map((chord, i) => createProgressionBlock(chord, result.beats[i])));
                    setLastCadenceResult(result);
                  }}
                  className={`flex items-center gap-1.5 font-bold px-3 py-2 rounded-xl shadow-md transition-colors text-xs whitespace-nowrap border ${
                    selectedMinorPatternId === pattern.id
                      ? "bg-amber-500/20 border-amber-400 text-amber-200"
                      : "border-amber-500/40 bg-stone-900 text-amber-300 hover:bg-amber-500/10"
                  }`}
                >
                  {pattern.label}
                </button>
              ))}
            </div>
          )}

          {/* 直近に生成された進行の理論的な内訳バッジ */}
          {lastCadenceResult && (
            <div className="flex items-center gap-2 flex-wrap bg-amber-500/10 border border-amber-500/40 rounded-xl px-3 py-2 text-[11px] font-bold text-amber-300">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>
                {lastCadenceResult.kind === "major"
                  ? `適用されたカデンツ：${lastCadenceResult.skeletonLabel} [${lastCadenceResult.endingLabel}]`
                  : `適用された進行：${lastCadenceResult.patternLabel}`}
              </span>
            </div>
          )}

          {/* 王道進行プリセット（固定パターン・長調のみ） */}
          {keyMode === "major" && (
            <div className="flex flex-wrap gap-2">
              {PROGRESSION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    setProgression(preset.chords.map((chord) => createProgressionBlock(chord, 4)));
                    setLastCadenceResult(null);
                  }}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-bold border border-stone-800 bg-stone-900 text-stone-300 hover:border-amber-500 hover:text-amber-300 transition-all"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}

          {/* 和声リズム・タイムストレッチ（一括） */}
          <div className="flex items-center gap-2 flex-wrap bg-stone-900/60 border border-stone-800 rounded-xl px-3 py-2">
            <span className="text-[10px] font-bold text-stone-500 tracking-wider whitespace-nowrap">
              和声リズム（一括）:
            </span>
            <button
              onClick={() => setAllBeats(2)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-stone-700 bg-stone-800 text-stone-300 hover:border-amber-500 hover:text-amber-300 transition-all"
            >
              ⏩ 一括倍速（各2拍 / 0.5倍）
            </button>
            <button
              onClick={() => setAllBeats(4)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-stone-700 bg-stone-800 text-stone-300 hover:border-amber-500 hover:text-amber-300 transition-all"
            >
              ▶ 一括標準（各4拍 / 1倍）
            </button>
            <button
              onClick={() => setAllBeats(8)}
              className="px-2.5 py-1 rounded-lg text-[11px] font-bold border border-stone-700 bg-stone-800 text-stone-300 hover:border-amber-500 hover:text-amber-300 transition-all"
            >
              ⏪ 一括倍長（各8拍 / 2倍）
            </button>
            <span className="text-[10px] text-stone-500 font-mono ml-auto">
              合計 {progression.reduce((sum, b) => sum + b.beats, 0)}拍
            </span>
          </div>

          <div className="flex flex-wrap gap-3">
            {progression.map((block, barIdx) => {
              const chordDef = activeChordLibrary.find((c) => c.name === block.chord);
              const fn = chordDef?.function ?? (keyMode === "major" ? "T" : "Tm");
              const style = FUNCTION_BADGE_STYLES[fn];
              const bassRelation = smoothBassInfo[barIdx];

              return (
                <div
                  key={block.id}
                  style={{ flex: `${block.beats} 1 150px` }}
                  className={`p-3 rounded-2xl border-2 transition-all ${
                    isPlaying && currentBar === barIdx
                      ? `bg-stone-800 ${style.border} shadow-md ring-1 ${style.ring}`
                      : `bg-stone-900 ${style.border}`
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-stone-500">小節 {barIdx + 1}</span>
                    <span className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${style.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      {FUNCTION_SHORT_LABELS[fn]}
                    </span>
                  </div>

                  <select
                    value={block.chord}
                    onChange={(e) => handleChordChange(barIdx, e.target.value)}
                    className="w-full bg-stone-950 border border-stone-700 text-base font-bold py-2 px-2 rounded-xl text-amber-400 outline-none"
                  >
                    {activeFunctionGroups.map((f) => (
                      <optgroup key={f} label={FUNCTION_LABELS[f]}>
                        {getChordsByFunctionGroup(keyMode, f).map((c) => (
                          <option key={c.name} value={c.name}>
                            {c.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>

                  <div className="h-4 mt-1">
                    {bassRelation && (
                      <div className="flex items-center gap-1 text-[10px] font-bold text-amber-300">
                        <Sparkle className="w-3 h-3" />
                        <span className="underline decoration-wavy decoration-amber-400 underline-offset-2">
                          {bassRelation === "same" ? "🔁 ベース同音" : "✨ スムーズベース"}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 個別タイムストレッチ: このブロックの長さ（拍） */}
                  <div className="flex items-center gap-1 mt-1">
                    {([1, 2, 4, 8] as BlockBeats[]).map((b) => (
                      <button
                        key={b}
                        onClick={() => handleBeatsChange(barIdx, b)}
                        className={`flex-1 py-1 rounded-md text-[10px] font-bold border transition-all ${
                          block.beats === b
                            ? "bg-amber-500 border-amber-400 text-stone-950"
                            : "bg-stone-950 border-stone-700 text-stone-500 hover:border-stone-500"
                        }`}
                      >
                        {b}拍
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* STEP 3: メロディリズム */}
        <div className="space-y-3 bg-stone-900/60 border border-stone-800 p-4 rounded-2xl">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="text-xs font-bold text-stone-400 tracking-wider">
              STEP 3: メロディのリズムを選択 (またはランダム生成)
            </label>
            <button
              onClick={() => setMelodyEnabled(!melodyEnabled)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-bold transition-all ${
                melodyEnabled
                  ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                  : "bg-stone-800 border-stone-600 text-stone-400"
              }`}
              title="コード進行の作成に集中したいときはメロディをオフにできます"
            >
              <span className={`w-8 h-4 rounded-full relative transition-colors ${melodyEnabled ? "bg-emerald-500" : "bg-stone-600"}`}>
                <span
                  className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${melodyEnabled ? "left-4" : "left-0.5"}`}
                />
              </span>
              {melodyEnabled ? "メロディ ON" : "メロディ OFF（コードに集中）"}
            </button>
          </div>

          <div className={`grid grid-cols-2 sm:grid-cols-5 gap-2 transition-opacity ${!melodyEnabled ? "opacity-40 pointer-events-none" : ""}`}>
            {melodyPatterns.map((mp) => (
              <button
                key={mp.id}
                onClick={() => setSelectedMelodyPatternId(mp.id)}
                disabled={!melodyEnabled}
                className={`p-2 rounded-xl text-center border text-xs font-bold transition-all ${
                  selectedMelodyPatternId === mp.id
                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-300"
                    : "bg-stone-900 border-stone-800 text-stone-400 hover:border-stone-700"
                }`}
              >
                {mp.name}
              </button>
            ))}
          </div>

          <div className={`pt-2 border-t border-stone-800 flex flex-col sm:flex-row items-center justify-between gap-3 transition-opacity ${!melodyEnabled ? "opacity-40 pointer-events-none" : ""}`}>
            <div className="flex-1 w-full">
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-stone-400">ランダム音数・密度パラメータ</span>
                <span className="text-emerald-400 font-mono">{noteDensity}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={noteDensity}
                onChange={(e) => setNoteDensity(parseInt(e.target.value, 10))}
                disabled={!melodyEnabled}
                className="w-full accent-emerald-500"
              />
            </div>

            <button
              onClick={generateRandomMelodyPattern}
              disabled={!melodyEnabled}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-bold px-5 py-2.5 rounded-xl shadow-md transition-colors text-xs whitespace-nowrap"
            >
              <Shuffle className="w-4 h-4" />
              🎲 ランダムリズム生成
            </button>
          </div>
        </div>

        {/* STEP 4: 理論フィルター & 特大パレット */}
        <div className="space-y-4 bg-stone-900/80 border border-stone-800 p-4 rounded-2xl">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
            <Sparkles className="w-4 h-4" /> STEP 4: メロディ音階フィルター & 特大パレット
          </div>

          <div className="bg-stone-950 border border-stone-800 p-3 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-1 text-stone-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> メロディ制限ルール
              </span>
              <span className="text-[11px] font-mono text-emerald-400">
                {!hasAnyFilterOn ? "★現在: 完全コード構成音のみモード" : "★現在: 経過音解禁モード"}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => setAllowPassingTones(!allowPassingTones)}
                className={`p-2.5 rounded-xl border font-bold text-left transition-all flex items-center justify-between ${
                  allowPassingTones
                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow"
                    : "bg-stone-900 border-stone-800 text-stone-500"
                }`}
              >
                <div>
                  <div>① 経過音(お隣の音)のみ許可</div>
                  <div className="text-[10px] text-stone-400 font-normal">構成音と隣り合うスケール音を解禁</div>
                </div>
                <span className="font-mono text-sm">{allowPassingTones ? "ON" : "OFF"}</span>
              </button>

              <button
                onClick={() => setAllowOnlyShortNotes(!allowOnlyShortNotes)}
                className={`p-2.5 rounded-xl border font-bold text-left transition-all flex items-center justify-between ${
                  allowOnlyShortNotes
                    ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow"
                    : "bg-stone-900 border-stone-800 text-stone-500"
                }`}
              >
                <div>
                  <div>② 短音(8分音符以下)のみ許可</div>
                  <div className="text-[10px] text-stone-400 font-normal">伸ばす長音は構成音に自動固定</div>
                </div>
                <span className="font-mono text-sm">{allowOnlyShortNotes ? "ON" : "OFF"}</span>
              </button>

              {hasAnyFilterOn && (
                <button
                  onClick={() => setForceChordToneOnChordChange(!forceChordToneOnChordChange)}
                  className={`p-2.5 rounded-xl border font-bold text-left transition-all flex items-center justify-between sm:col-span-2 ${
                    forceChordToneOnChordChange
                      ? "bg-amber-500/20 border-amber-400 text-amber-300 shadow"
                      : "bg-stone-900 border-stone-800 text-stone-500"
                  }`}
                >
                  <div>
                    <div>③ コード変更のタイミング(1拍目)は構成音固定</div>
                    <div className="text-[10px] text-stone-400 font-normal">小節頭の1音目をコード構成音にして抜群の安定感をプラス</div>
                  </div>
                  <span className="font-mono text-sm">{forceChordToneOnChordChange ? "ON" : "OFF"}</span>
                </button>
              )}
            </div>
          </div>

          {/* 4倍特大メロディパレット */}
          <div className="flex flex-col sm:flex-row items-stretch gap-6 justify-center pt-2">
            <div
              className="w-[224px] h-[360px] bg-gradient-to-t from-stone-900 via-emerald-950/60 to-stone-900 border-2 border-emerald-500/80 rounded-3xl relative overflow-hidden touch-none cursor-ns-resize shadow-2xl flex flex-col justify-between p-3 select-none"
              onMouseMove={(e) => {
                if (e.buttons === 1) {
                  const rect = e.currentTarget.getBoundingClientRect();
                  updatePaletteY(e.clientY, rect);
                }
              }}
              onTouchMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                updatePaletteY(e.touches[0].clientY, rect);
              }}
              onMouseDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                updatePaletteY(e.clientY, rect);
              }}
            >
              <div className="absolute inset-0 grid grid-rows-12 pointer-events-none opacity-25">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="border-b border-emerald-300 w-full" />
                ))}
              </div>

              <div className="text-xs text-emerald-400 font-mono font-bold text-center pointer-events-none z-10">
                ▲ 高音域 (キーボード ↑)
              </div>

              <div
                className="absolute left-0 right-0 h-3 bg-emerald-400 shadow-[0_0_20px_rgba(52,211,153,1.0)] pointer-events-none z-10"
                style={{ bottom: `${paletteY * 100}%` }}
              />

              <div className="text-[11px] text-stone-300 font-bold text-center pointer-events-none z-10 bg-stone-950/80 py-1 px-2 rounded-xl backdrop-blur-sm border border-emerald-500/30">
                特大メロディパレット<br />
                <span className="text-[10px] text-emerald-300 font-mono">
                  音高: {Math.round(paletteY * 100)}%
                </span>
              </div>

              <div className="text-xs text-emerald-400 font-mono font-bold text-center pointer-events-none z-10">
                ▼ 低音域 (キーボード ↓)
              </div>
            </div>

            <div className="flex flex-col gap-6 justify-center items-center sm:items-stretch">
              <div className="text-xs text-stone-300 space-y-2 text-center sm:text-left">
                <div className="font-bold text-emerald-400 text-sm">操作ガイド</div>
                <p className="text-[11px] text-stone-400 leading-relaxed">
                  ・画面上部の「録音開始」を押すと、今鳴っている音は一旦止まり、4カウント（クリック音）の後に小節1・1つ目のコードから録音つきで再生が始まります。<br />
                  ・録音・再生・MIDI出力ボタンは画面をスクロールしても常に上部に表示されています。
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 16ステップ可視化メーター */}
        <div className="bg-stone-900/60 border border-stone-800 p-4 rounded-2xl space-y-2">
          <div className="text-xs font-bold text-stone-400">
            16ステップ演奏進行（{playMode === "stroke" ? "ギター↓↑✕" : "アルペジオ♪弦数"} / メロディ★）
          </div>
          <div className="grid grid-cols-16 gap-1">
            {Array.from({ length: 16 }).map((_, i) => {
              const currentMelodyPattern = melodyPatterns.find((p) => p.id === selectedMelodyPatternId) || melodyPatterns[0];
              const isMelody = currentMelodyPattern?.mask[i];

              let glyph = "・";
              let glyphClass = "text-stone-500";
              if (playMode === "stroke") {
                const action = activeStrokeActions[i];
                if (action?.dir === "down") { glyph = "↓"; glyphClass = "text-amber-300"; }
                else if (action?.dir === "up") { glyph = "↑"; glyphClass = "text-emerald-300"; }
                else if (action?.dir === "mute") { glyph = "✕"; glyphClass = "text-rose-300"; }
              } else {
                const window = 16 / arpeggioPattern.steps;
                const isWindowStart = i % window === 0;
                if (isWindowStart) {
                  const arpIdx = Math.floor(i / window);
                  const activeCount = arpeggioPattern.grid.reduce((sum, row) => sum + (row[arpIdx] ? 1 : 0), 0);
                  if (activeCount > 0) { glyph = `♪${activeCount}`; glyphClass = "text-amber-300"; }
                }
              }

              return (
                <div
                  key={i}
                  className={`h-12 rounded flex flex-col items-center justify-center text-[10px] font-mono transition-all ${
                    isPlaying && currentStep === i
                      ? "bg-amber-400 text-stone-950 font-bold scale-105"
                      : "bg-stone-900 border border-stone-800"
                  }`}
                >
                  <span className={glyphClass}>{glyph}</span>
                  <span className="text-[8px] font-bold text-rose-400">{isMelody ? "★" : ""}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}