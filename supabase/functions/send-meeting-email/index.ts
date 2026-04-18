import { corsHeaders } from "@supabase/supabase-js/cors";
import { sendEmail } from "@lovable.dev/email-js";

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
      return new Response(JSON.stringify({ error: "missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const taskHtml = body.tasks.length
      ? `<h3 style="margin:24px 0 8px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#111">Your action items</h3>
         <ul style="padding-left:18px;font-family:Inter,Arial,sans-serif;font-size:14px;color:#333">
           ${body.tasks.map((t) => `<li>${escapeHtml(t.title)}${t.due ? ` <span style="color:#888">(due ${escapeHtml(t.due)})</span>` : ""}</li>`).join("")}
         </ul>`
      : `<p style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#666"><i>No action items assigned to you in this meeting.</i></p>`;

    const html = `<!doctype html><html><body style="margin:0;background:#fff">
      <div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:Inter,Arial,sans-serif">
        <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#0aa37d;font-weight:600">Meeting OS</div>
        <h1 style="font-size:22px;margin:6px 0 16px;color:#111">${escapeHtml(body.meetingTitle)}</h1>
        <p style="font-size:14px;color:#444;line-height:1.55;white-space:pre-wrap">${escapeHtml(body.summary)}</p>
        ${taskHtml}
        <hr style="border:none;border-top:1px solid #eee;margin:32px 0" />
        <p style="font-size:12px;color:#999">Sent from your Meeting OS workspace.</p>
      </div>
    </body></html>`;

    await sendEmail({
      to: body.recipient,
      subject: `[Meeting OS] ${body.meetingTitle}`,
      html,
    });

    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
