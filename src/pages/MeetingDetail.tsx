import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { decryptText, decryptBlob } from "@/lib/crypto";
import { fmtTime, fmtDuration, fmtRelative } from "@/lib/format";
import { toast } from "sonner";
import { ArrowLeft, Mail, FileText, ListChecks, HelpCircle, Image as ImageIcon, Play } from "lucide-react";

type Meeting = { id: string; title: string; language: string; status: string; is_leadership: boolean; started_at: string | null; duration_seconds: number | null; audio_path: string | null };
type Segment = { id: string; start_ms: number; end_ms: number; speaker: string | null; text_encrypted: string; text_iv: string };
type Task = { id: string; title: string; description: string | null; assignee_email: string | null; assignee_name: string | null; status: string; source_timestamp_ms: number | null; due_date: string | null };
type Decision = { id: string; text: string; source_timestamp_ms: number | null };
type Question = { id: string; text: string; source_timestamp_ms: number | null; resolved: boolean };
type Shot = { id: string; storage_path: string; timestamp_ms: number };

export default function MeetingDetail() {
  const { id } = useParams<{ id: string }>();
  const [m, setM] = useState<Meeting | null>(null);
  const [summary, setSummary] = useState("");
  const [segments, setSegments] = useState<(Segment & { text: string })[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [shots, setShots] = useState<(Shot & { url: string })[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);
  const [sending, setSending] = useState(false);
  const [participantsText, setParticipantsText] = useState("");

  useEffect(() => { if (id) load(id); }, [id]);

  async function load(mid: string) {
    const [{ data: meet }, sums, segs, ts, ds, qs, shs] = await Promise.all([
      supabase.from("meetings").select("*").eq("id", mid).single(),
      supabase.from("summaries").select("*").eq("meeting_id", mid).order("generated_at", { ascending: false }).limit(1),
      supabase.from("transcript_segments").select("*").eq("meeting_id", mid).order("start_ms"),
      supabase.from("tasks").select("*").eq("meeting_id", mid).order("source_timestamp_ms"),
      supabase.from("decisions").select("*").eq("meeting_id", mid).order("source_timestamp_ms"),
      supabase.from("open_questions").select("*").eq("meeting_id", mid).order("source_timestamp_ms"),
      supabase.from("screenshots").select("*").eq("meeting_id", mid).order("timestamp_ms"),
    ]);
    setM(meet);
    setTasks(ts.data ?? []); setDecisions(ds.data ?? []); setQuestions(qs.data ?? []);

    if (sums.data?.[0]) {
      try { setSummary(await decryptText(sums.data[0].content_encrypted, sums.data[0].content_iv)); } catch { setSummary("(vault locked)"); }
    }
    if (segs.data) {
      const decoded = await Promise.all(segs.data.map(async (s) => {
        try { return { ...s, text: await decryptText(s.text_encrypted, s.text_iv) }; }
        catch { return { ...s, text: "(encrypted)" }; }
      }));
      setSegments(decoded);
    }
    // screenshots
    if (shs.data?.length) {
      const decoded = await Promise.all(shs.data.map(async (s) => {
        try {
          const [path, iv] = s.storage_path.split("::");
          const { data: file } = await supabase.storage.from("meeting-screenshots").download(path);
          if (!file) return null;
          const dec = await decryptBlob(file, iv, "image/jpeg");
          return { ...s, url: URL.createObjectURL(dec) };
        } catch { return null; }
      }));
      setShots(decoded.filter(Boolean) as any);
    }
    // audio
    if (meet?.audio_path) {
      try {
        const [path, iv] = meet.audio_path.split("::");
        const { data: file } = await supabase.storage.from("meeting-audio").download(path);
        if (file) {
          const dec = await decryptBlob(file, iv, "audio/webm");
          setAudioUrl(URL.createObjectURL(dec));
        }
      } catch {}
    }
  }

  function jumpTo(ms: number | null) {
    if (ms == null || !audioRef) return;
    audioRef.currentTime = ms / 1000;
    audioRef.play().catch(() => {});
  }

  async function updateTaskStatus(taskId: string, status: string) {
    await supabase.from("tasks").update({ status: status as any }).eq("id", taskId);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
  }

  async function sendEmails() {
    if (!m) return;
    const emails = participantsText.split(/[,\s]+/).filter((e) => e.includes("@"));
    if (emails.length === 0) return toast.error("Add at least one participant email");
    setSending(true);
    try {
      // Group tasks by assignee email
      const byEmail: Record<string, Task[]> = {};
      for (const t of tasks) {
        const e = t.assignee_email && emails.includes(t.assignee_email) ? t.assignee_email : null;
        if (!e) continue;
        (byEmail[e] = byEmail[e] || []).push(t);
      }
      // Also email the meeting owner everyone's tasks
      const userId = (await supabase.auth.getUser()).data.user!.id;
      for (const email of emails) {
        const personalTasks = byEmail[email] ?? [];
        const { error } = await supabase.functions.invoke("send-meeting-email", {
          body: {
            recipient: email,
            meetingTitle: m.title,
            summary: summary || "(no summary)",
            tasks: personalTasks.map((t) => ({ title: t.title, due: t.due_date, ts: t.source_timestamp_ms })),
          },
        });
        if (error) throw error;
        await supabase.from("email_log").insert({ user_id: userId, meeting_id: m.id, recipient_email: email, subject: `[Meeting OS] ${m.title}`, status: "sent" });
      }
      toast.success(`Emails queued to ${emails.length} recipients`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to send");
    } finally { setSending(false); }
  }

  if (!m) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
      <Link to="/meetings" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-3 w-3" /> All meetings
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight flex items-center gap-2">
            {m.title}
            {m.is_leadership && <Badge variant="outline">leadership</Badge>}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {m.started_at ? fmtRelative(m.started_at) : "—"} · {fmtDuration(m.duration_seconds)} · {m.language}
          </p>
        </div>
        <Badge variant={m.status === "completed" ? "secondary" : "outline"}>{m.status}</Badge>
      </header>

      {audioUrl && (
        <Card className="border-border/60">
          <CardContent className="p-4 flex items-center gap-3">
            <Play className="h-4 w-4 text-primary" />
            <audio ref={setAudioRef} controls src={audioUrl} className="w-full" />
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="brief">
        <TabsList>
          <TabsTrigger value="brief"><FileText className="h-4 w-4 mr-1.5" />Brief</TabsTrigger>
          <TabsTrigger value="tasks"><ListChecks className="h-4 w-4 mr-1.5" />Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="questions"><HelpCircle className="h-4 w-4 mr-1.5" />Open ({questions.length})</TabsTrigger>
          <TabsTrigger value="shots"><ImageIcon className="h-4 w-4 mr-1.5" />Slides ({shots.length})</TabsTrigger>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="email"><Mail className="h-4 w-4 mr-1.5" />Email</TabsTrigger>
        </TabsList>

        <TabsContent value="brief" className="space-y-4 mt-4">
          <Card className="border-border/60"><CardHeader><CardTitle className="text-base">Summary</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap leading-relaxed">{summary || "(no summary generated)"}</p></CardContent>
          </Card>
          <Card className="border-border/60"><CardHeader><CardTitle className="text-base">Decisions</CardTitle></CardHeader>
            <CardContent>
              {decisions.length === 0 ? <p className="text-sm text-muted-foreground italic">None recorded</p> : (
                <ul className="space-y-2">
                  {decisions.map((d) => (
                    <li key={d.id} className="flex gap-3 text-sm">
                      <button onClick={() => jumpTo(d.source_timestamp_ms)} className="text-xs text-primary hover:underline tabular-nums shrink-0 mt-0.5">{d.source_timestamp_ms != null ? fmtTime(d.source_timestamp_ms) : "—"}</button>
                      <span>{d.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <Card className="border-border/60">
            <CardContent className="p-4 space-y-2">
              {tasks.length === 0 ? <p className="text-sm text-muted-foreground italic">No tasks extracted</p> : tasks.map((t) => (
                <div key={t.id} className="flex items-start gap-3 p-3 rounded-md bg-muted/40 border border-border/60">
                  <button onClick={() => jumpTo(t.source_timestamp_ms)} className="text-xs text-primary hover:underline tabular-nums shrink-0 mt-0.5">
                    {t.source_timestamp_ms != null ? fmtTime(t.source_timestamp_ms) : "—"}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{t.title}</div>
                    {(t.assignee_name || t.assignee_email || t.due_date) && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {t.assignee_name || t.assignee_email}
                        {t.due_date && <> · due {new Date(t.due_date).toLocaleDateString()}</>}
                      </div>
                    )}
                  </div>
                  <select value={t.status} onChange={(e) => updateTaskStatus(t.id, e.target.value)} className="text-xs bg-background border border-border rounded px-2 py-1">
                    <option value="pending">Pending</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions" className="mt-4">
          <Card className="border-border/60"><CardContent className="p-4">
            {questions.length === 0 ? <p className="text-sm text-muted-foreground italic">None recorded</p> : (
              <ul className="space-y-2">
                {questions.map((q) => (
                  <li key={q.id} className="flex gap-3 text-sm">
                    <button onClick={() => jumpTo(q.source_timestamp_ms)} className="text-xs text-primary hover:underline tabular-nums shrink-0 mt-0.5">{q.source_timestamp_ms != null ? fmtTime(q.source_timestamp_ms) : "—"}</button>
                    <span>{q.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="shots" className="mt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {shots.length === 0 ? <p className="text-sm text-muted-foreground italic col-span-full">No keyframes captured</p> : shots.map((s) => (
              <button key={s.id} onClick={() => jumpTo(s.timestamp_ms)} className="group relative">
                <img src={s.url} alt={`Frame at ${fmtTime(s.timestamp_ms)}`} className="w-full aspect-video object-cover rounded-md border border-border/60 group-hover:border-primary/50" loading="lazy" />
                <span className="absolute bottom-1 right-1 bg-background/80 backdrop-blur px-1.5 py-0.5 rounded text-[10px] font-mono">{fmtTime(s.timestamp_ms)}</span>
              </button>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="transcript" className="mt-4">
          <Card className="border-border/60"><CardContent className="p-4">
            <div className="space-y-2 font-mono text-sm max-h-[600px] overflow-auto scrollbar-thin pr-2">
              {segments.map((s) => (
                <div key={s.id} className="flex gap-3">
                  <button onClick={() => jumpTo(s.start_ms)} className="text-primary hover:underline tabular-nums text-xs shrink-0 mt-0.5">{fmtTime(s.start_ms)}</button>
                  <span className="text-foreground/90">{s.text}</span>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="email" className="mt-4">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Send personalized task emails</CardTitle>
              <CardDescription>Each participant gets only the tasks assigned to their email.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Participant emails (comma or space separated)</Label>
                <Input placeholder="alice@x.com, bob@x.com" value={participantsText} onChange={(e) => setParticipantsText(e.target.value)} />
              </div>
              <Button variant="hero" onClick={sendEmails} disabled={sending}>
                <Mail className="h-4 w-4 mr-2" /> {sending ? "Sending…" : "Send emails"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
