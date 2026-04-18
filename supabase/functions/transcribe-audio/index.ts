// Cloud transcription via Lovable AI Gateway (Gemini supports inline audio).
// Accepts multipart/form-data with `file` (audio blob) and optional `language`.
// Returns { text: string }.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
const MODEL = "google/gemini-2.5-flash";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const form = await req.formData();
    const file = form.get("file");
    const language = (form.get("language") as string | null) ?? "auto";
    const prompt = (form.get("prompt") as string | null) ?? "";

    if (!(file instanceof File) && !(file instanceof Blob)) {
      throw new Error("Missing 'file' field");
    }

    const buf = new Uint8Array(await (file as Blob).arrayBuffer());
    // base64-encode
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    const b64 = btoa(binary);
    const mime = (file as Blob).type || "audio/webm";

    const langInstruction =
      language === "auto"
        ? "Detect the spoken language."
        : `The audio is in ${language === "hi" ? "Hindi" : language === "en" ? "English" : language}.`;
    const vocabHint = prompt ? ` Known names/terms that may appear: ${prompt}.` : "";

    const body = {
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a precise speech-to-text engine. Transcribe the audio verbatim. " +
            "Do not summarize, translate, or add commentary. Output ONLY the transcript text. " +
            "CRITICAL: If the audio contains no speech (silence, music, tones, noise, or unintelligible sound), " +
            "output exactly the empty string. Never invent or hallucinate words that are not clearly spoken. " +
            "Never describe the audio.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `${langInstruction}${vocabHint} Transcribe now.` },
            { type: "input_audio", input_audio: { data: b64, format: mime.split("/")[1]?.split(";")[0] ?? "webm" } },
          ],
        },
      ],
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limited. Try again in a moment." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (res.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Add credits in Lovable Cloud settings." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI gateway HTTP ${res.status}: ${t.slice(0, 300)}`);
    }
    const json = await res.json();
    const text = json.choices?.[0]?.message?.content?.trim() ?? "";

    return new Response(JSON.stringify({ text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe-audio error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
