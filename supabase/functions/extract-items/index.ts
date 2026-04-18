// Cloud extraction of tasks/decisions/questions/topics + rolling summary.
// Uses Lovable AI Gateway (Gemini Flash, free tier).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const MODEL = "google/gemini-2.5-flash";

const SYSTEM_BASE =
  "You are an extremely precise meeting intelligence assistant. " +
  "Be terse, factual, and never invent information. " +
  "If uncertain about a name or detail, mark it [unverified] rather than guessing.";

interface Body {
  mode: "extract" | "summary";
  transcript: string;
  language?: string;
  vocabulary?: string[];
}

async function callGateway(messages: any[], jsonMode: boolean) {
  const body: any = {
    model: MODEL,
    messages,
  };
  if (jsonMode) body.response_format = { type: "json_object" };

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (res.status === 402) throw new Error("CREDITS");
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`AI gateway HTTP ${res.status}: ${t.slice(0, 300)}`);
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { mode, transcript, language = "en", vocabulary = [] } = (await req.json()) as Body;
    if (!transcript || typeof transcript !== "string") throw new Error("Missing transcript");

    if (mode === "summary") {
      const langName = language === "hi" ? "Hindi" : "English";
      const sys = `${SYSTEM_BASE} Write a concise rolling summary (5-8 bullets max) in ${langName}.`;
      const out = await callGateway(
        [
          { role: "system", content: sys },
          { role: "user", content: `Summarize the meeting so far. Bullets only. Be concrete.\n\n${transcript}` },
        ],
        false,
      );
      return new Response(JSON.stringify({ summary: out }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // mode === "extract"
    const vocabHint = vocabulary.length ? `Known names/terms: ${vocabulary.slice(0, 200).join(", ")}.` : "";
    const sys = `${SYSTEM_BASE} ${vocabHint} Output strict JSON only.`;
    const prompt = `Language: ${language}.
From the timestamped transcript below, extract:
- decisions: concrete decisions made (not opinions)
- tasks: action items with assignee email/name if mentioned, due date if explicit
- open_questions: questions raised but not answered
- topics: short topic tags (1-3 words each)

Each task/decision/question must include source timestamp_ms (the start of the relevant utterance, in ms from meeting start). Only include items with confidence >= 0.6. Return JSON exactly:
{"decisions":[{"text":"","timestamp_ms":0,"confidence":0.0}],
 "tasks":[{"title":"","description":"","assignee":"","due_date":"YYYY-MM-DD","timestamp_ms":0,"confidence":0.0}],
 "open_questions":[{"text":"","timestamp_ms":0}],
 "topics":["..."]}

Transcript:
${transcript}`;

    const raw = await callGateway(
      [
        { role: "system", content: sys },
        { role: "user", content: prompt },
      ],
      true,
    );

    let parsed: any = {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    }

    return new Response(
      JSON.stringify({
        decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        open_questions: Array.isArray(parsed.open_questions) ? parsed.open_questions : [],
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = (e as Error).message;
    console.error("extract-items error", msg);
    const status = msg === "RATE_LIMIT" ? 429 : msg === "CREDITS" ? 402 : 500;
    return new Response(
      JSON.stringify({
        error:
          msg === "RATE_LIMIT"
            ? "Rate limited. Try again in a moment."
            : msg === "CREDITS"
              ? "AI credits exhausted. Add credits in Lovable Cloud settings."
              : msg,
      }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
