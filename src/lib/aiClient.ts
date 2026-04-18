// Client for AI services. Supports two providers per user:
//   - "cloud" (default): uses Lovable AI Gateway via Supabase edge functions.
//                        No setup, no API keys. Works out of the box.
//   - "local":           uses the user's own Ollama + Whisper-compatible servers.

import { supabase } from "@/integrations/supabase/client";

export type AIProvider = "cloud" | "local";

export interface UserAIConfig {
  ai_provider: AIProvider;
  ollama_url: string;
  ollama_model: string;
  whisper_url: string;
  whisper_model: string;
}

let cached: UserAIConfig | null = null;

export async function getAIConfig(force = false): Promise<UserAIConfig> {
  if (cached && !force) return cached;
  const { data, error } = await supabase
    .from("user_settings")
    .select("ai_provider, ollama_url, ollama_model, whisper_url, whisper_model")
    .maybeSingle();
  if (error) throw error;
  cached = {
    ai_provider: ((data as any)?.ai_provider as AIProvider) ?? "cloud",
    ollama_url: data?.ollama_url ?? "http://localhost:11434",
    ollama_model: data?.ollama_model ?? "llama3.1",
    whisper_url: data?.whisper_url ?? "http://localhost:8000",
    whisper_model: data?.whisper_model ?? "base",
  };
  return cached;
}

export function clearAIConfigCache() {
  cached = null;
}

/**
 * Transcribe an audio blob.
 * Cloud → invokes the `transcribe-audio` edge function (Lovable AI Gateway).
 * Local → POSTs to a Whisper-compatible server (faster-whisper-server, whisper.cpp, OpenAI-compatible).
 */
export async function transcribe(
  audio: Blob,
  opts: { language?: string; prompt?: string; mimeType?: string } = {},
): Promise<{ text: string; segments?: Array<{ start: number; end: number; text: string }> }> {
  const cfg = await getAIConfig();

  if (cfg.ai_provider === "cloud") {
    const fd = new FormData();
    const ext = (opts.mimeType ?? audio.type).split("/")[1]?.split(";")[0] ?? "webm";
    fd.append("file", audio, `audio.${ext}`);
    if (opts.language && opts.language !== "auto") fd.append("language", opts.language);
    if (opts.prompt) fd.append("prompt", opts.prompt);

    const { data, error } = await supabase.functions.invoke("transcribe-audio", { body: fd });
    if (error) throw new Error(error.message ?? "Cloud transcription failed");
    if (data?.error) throw new Error(data.error);
    return { text: data?.text ?? "" };
  }

  // ----- local -----
  const url = cfg.whisper_url.replace(/\/$/, "");
  const fd = new FormData();
  const filename = `audio.${(opts.mimeType ?? audio.type).split("/")[1]?.split(";")[0] ?? "webm"}`;
  fd.append("file", audio, filename);
  fd.append("model", cfg.whisper_model);
  if (opts.language && opts.language !== "auto") fd.append("language", opts.language);
  if (opts.prompt) fd.append("prompt", opts.prompt);
  fd.append("response_format", "verbose_json");

  const candidates = [`${url}/v1/audio/transcriptions`, `${url}/audio/transcriptions`, `${url}/inference`];
  let lastErr: any;
  for (const ep of candidates) {
    try {
      const res = await fetch(ep, { method: "POST", body: fd });
      if (!res.ok) {
        lastErr = new Error(`${ep} → HTTP ${res.status}`);
        continue;
      }
      const json = await res.json();
      return { text: json.text ?? json.transcription ?? "", segments: json.segments };
    } catch (e: any) {
      lastErr = e;
    }
  }
  throw new Error(`Whisper transcription failed: ${lastErr?.message ?? "unknown"}`);
}

/**
 * Run extraction or summarization through whichever provider is active.
 */
export async function runLLMExtract(transcript: string, vocabulary: string[], language: string) {
  const cfg = await getAIConfig();
  if (cfg.ai_provider === "cloud") {
    const { data, error } = await supabase.functions.invoke("extract-items", {
      body: { mode: "extract", transcript, vocabulary, language },
    });
    if (error) throw new Error(error.message ?? "Cloud extract failed");
    if (data?.error) throw new Error(data.error);
    return data;
  }
  // local — handled in aiPrompts.ts via ollamaJSON
  return null;
}

export async function runLLMSummary(transcript: string, language: string): Promise<string | null> {
  const cfg = await getAIConfig();
  if (cfg.ai_provider === "cloud") {
    const { data, error } = await supabase.functions.invoke("extract-items", {
      body: { mode: "summary", transcript, language },
    });
    if (error) throw new Error(error.message ?? "Cloud summary failed");
    if (data?.error) throw new Error(data.error);
    return data?.summary ?? "";
  }
  return null;
}

/* ============= Local-only helpers (Ollama) ============= */

export async function ollamaGenerate(
  prompt: string,
  opts: { system?: string; format?: "json" | "text"; temperature?: number } = {},
): Promise<string> {
  const cfg = await getAIConfig();
  const url = cfg.ollama_url.replace(/\/$/, "");
  const body: any = {
    model: cfg.ollama_model,
    prompt,
    stream: false,
    options: { temperature: opts.temperature ?? 0.2 },
  };
  if (opts.system) body.system = opts.system;
  if (opts.format === "json") body.format = "json";
  const res = await fetch(`${url}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text().catch(() => "")}`);
  const json = await res.json();
  return json.response ?? "";
}

export async function ollamaJSON<T = any>(prompt: string, system: string): Promise<T> {
  const out = await ollamaGenerate(prompt, { system, format: "json", temperature: 0.1 });
  try {
    return JSON.parse(out);
  } catch {
    const match = out.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) return JSON.parse(match[0]);
    throw new Error("Could not parse JSON from Ollama response");
  }
}

export async function pingOllama(): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  try {
    const cfg = await getAIConfig();
    const res = await fetch(`${cfg.ollama_url.replace(/\/$/, "")}/api/tags`);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const json = await res.json();
    return { ok: true, models: (json.models ?? []).map((m: any) => m.name) };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

export async function pingWhisper(): Promise<{ ok: boolean; error?: string }> {
  try {
    const cfg = await getAIConfig();
    const url = cfg.whisper_url.replace(/\/$/, "");
    for (const path of ["/health", "/v1/models", "/", "/docs"]) {
      const res = await fetch(`${url}${path}`).catch(() => null);
      if (res && res.ok) return { ok: true };
    }
    return { ok: false, error: "No health endpoint reachable" };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
