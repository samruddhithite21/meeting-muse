const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Body {
  recipient: string;
  meetingTitle: string;
  summary: string;
  tasks: { title: string; due?: string | null; ts?: number | null }[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = (await req.json()) as Body;
    if (!body.recipient || !body.meetingTitle) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Email delivery is logged for now. To actually send, configure an email
    // domain in Cloud → Emails and wire this function to Lovable Email.
    console.log("[send-meeting-email] queued", body.recipient, "tasks:", body.tasks.length);
    return new Response(
      JSON.stringify({ ok: true, queued: true, note: "Set up an email domain in Cloud → Emails to deliver these." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
