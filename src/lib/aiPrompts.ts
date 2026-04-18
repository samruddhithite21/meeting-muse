// Prompts and helpers for transcript intelligence.
// Routes through the active provider (cloud edge function OR local Ollama).

import { ollamaJSON, ollamaGenerate, runLLMExtract, runLLMSummary, getAIConfig } from "./aiClient";

export const SYSTEM_BASE =
  "You are an extremely precise meeting intelligence assistant. " +
  "Be terse, factual, and never invent information. " +
  "If you are uncertain about a name or detail, say so explicitly with [unverified] rather than guessing.";

export interface ExtractedItems {
  decisions: { text: string; timestamp_ms?: number; confidence: number }[];
  tasks: { title: string; description?: string; assignee?: string; due_date?: string; timestamp_ms?: number; confidence: number }[];
  open_questions: { text: string; timestamp_ms?: number }[];
  topics: string[];
}

const EMPTY: ExtractedItems = { decisions: [], tasks: [], open_questions: [], topics: [] };

export async function extractItems(
  transcriptWithTimes: string,
  vocabulary: string[],
  language: string,
): Promise<ExtractedItems> {
  const cfg = await getAIConfig();
  if (cfg.ai_provider === "cloud") {
    try {
      const data = await runLLMExtract(transcriptWithTimes, vocabulary, language);
      return data ?? EMPTY;
    } catch (e) {
      console.error("[extractItems cloud]", e);
      throw e;
    }
  }

  // local Ollama
  const vocabHint = vocabulary.length ? `Known names/terms: ${vocabulary.slice(0, 200).join(", ")}.` : "";
  const sys = `${SYSTEM_BASE} ${vocabHint} Output strict JSON only.`;
  const prompt = `Language: ${language}.
From the timestamped transcript below, extract:
- decisions: concrete decisions made (not just opinions)
- tasks: action items with assignee email/name if mentioned, due date if explicit
- open_questions: questions raised but not answered
- topics: short topic tags (1-3 words each)

Each task/decision/question must include the source timestamp_ms (the start of the relevant utterance, in milliseconds from the start of the meeting). Only include high-confidence items (>=0.6). Return JSON with shape:
{"decisions":[{"text":"","timestamp_ms":0,"confidence":0.0}],
 "tasks":[{"title":"","description":"","assignee":"","due_date":"YYYY-MM-DD","timestamp_ms":0,"confidence":0.0}],
 "open_questions":[{"text":"","timestamp_ms":0}],
 "topics":["..."]}

Transcript:
${transcriptWithTimes}`;
  try {
    const json = await ollamaJSON<ExtractedItems>(prompt, sys);
    return {
      decisions: Array.isArray(json.decisions) ? json.decisions : [],
      tasks: Array.isArray(json.tasks) ? json.tasks : [],
      open_questions: Array.isArray(json.open_questions) ? json.open_questions : [],
      topics: Array.isArray(json.topics) ? json.topics : [],
    };
  } catch (e) {
    console.error("[extractItems local]", e);
    throw e;
  }
}

export async function rollingSummary(transcriptWithTimes: string, language: string): Promise<string> {
  const cfg = await getAIConfig();
  if (cfg.ai_provider === "cloud") {
    return (await runLLMSummary(transcriptWithTimes, language)) ?? "";
  }
  const sys = `${SYSTEM_BASE} Write a concise rolling summary (5-8 bullet points max) in ${language === "hi" ? "Hindi" : "English"}.`;
  const prompt = `Summarize the meeting so far. Bullets only. Be concrete.\n\n${transcriptWithTimes}`;
  return await ollamaGenerate(prompt, { system: sys, temperature: 0.2 });
}

export async function finalSummary(transcriptWithTimes: string, language: string): Promise<string> {
  const cfg = await getAIConfig();
  if (cfg.ai_provider === "cloud") {
    return (await runLLMSummary(transcriptWithTimes, language)) ?? "";
  }
  const sys = `${SYSTEM_BASE} Produce a polished post-meeting brief in ${language === "hi" ? "Hindi" : "English"}.`;
  const prompt = `Generate a final brief with sections: Overview (2-3 lines), Key points (bullets), Outcomes, Next steps.\n\n${transcriptWithTimes}`;
  return await ollamaGenerate(prompt, { system: sys, temperature: 0.3 });
}
