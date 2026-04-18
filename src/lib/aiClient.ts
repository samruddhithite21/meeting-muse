// Client for the user's locally-hosted Ollama and Whisper services.
// All requests are made directly from the browser — the user must enable CORS
// on their endpoints (e.g. OLLAMA_ORIGINS="*" ollama serve).

import { supabase } from "@/integrations/supabase/client";

export interface UserAIConfig {
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
    .select("ollama_url, ollama_model, whisper_url, whisper_model")
    .maybeSingle();
  if (error) throw error;
  cached = {
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
 * Transcribe an audio blob using a Whisper-compatible HTTP server.
 * Works with: faster-whisper-server, whisper.cpp server, OpenAI-compatible endpoints.
 * The endpoint must accept multipart/form-data at /v1/audio/transcriptions or /audio/transcriptions.
 */
export async function transcribe(
  audio: Blob,
  opts: { language?: string; prompt?: string; mimeType?: string } = {},
): Promise<{ text: string; segments?: Array<{ start: number; end: number; text: string }> }> {
  const cfg = await getAIConfig();
  const url = cfg.whisper_url.replace(/\/$/, "");
  const fd = new FormData();
  const filename = `audio.${(opts.mimeType ?? audio.type).split("/")[1]?.split(";")[0] ?? "webm"}`;
  fd.append("file", audio, filename);
  fd.append("model", cfg.whisper_model);
  if (opts.language && opts.language !== "auto") fd.append("language", opts.language);
  if (opts.prompt) fd.append("prompt", opts.prompt);
  fd.append("response_format", "verbose_json");

  // Try OpenAI-compatible path first, fall back to whisper.cpp /inference
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
      return {
        text: json.text ?? json.transcription ?? "",
        segments: json.segments,
      };
    } catch (e: any) {
      lastErr = e;
    }
  }
  throw new Error(`Whisper transcription failed: ${lastErr?.message ?? "unknown"}`);
}

/**
 * Call Ollama /api/generate with JSON mode for structured outputs.
 */
export async function ollamaGenerate(prompt: string, opts: { system?: string; format?: "json" | "text"; temperature?: number } = {}): Promise<string> {
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
    // try to extract JSON braces
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
    // try a few common health paths
    for (const path of ["/health", "/v1/models", "/", "/docs"]) {
      const res = await fetch(`${url}${path}`).catch(() => null);
      if (res && res.ok) return { ok: true };
    }
    return { ok: false, error: "No health endpoint reachable" };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
