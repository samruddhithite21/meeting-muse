import { corsHeaders } from "@supabase/supabase-js/cors";

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
    // Email infrastructure not yet provisioned in this project — log the request
    // for now. Wire up Lovable Email by enabling an email domain + scaffolding
    // transactional emails to actually deliver these.
    console.log("[send-meeting-email] would send to", body.recipient, "tasks:", body.tasks.length);
    return new Response(JSON.stringify({ ok: true, queued: true, note: "Email domain not yet configured. Set one up under Cloud → Emails to start delivery." }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
