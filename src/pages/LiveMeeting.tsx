import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Mic, Square, Loader2, Image as ImageIcon, Sparkles, Zap } from "lucide-react";
import { startMeetingCapture, captureFrame, hammingDistance, type RecorderHandles } from "@/lib/recorder";
import { transcribe } from "@/lib/aiClient";
import { extractItems, rollingSummary } from "@/lib/aiPrompts";
import { encryptText, encryptBlob, sha256Hex } from "@/lib/crypto";
import { fmtTime } from "@/lib/format";
import { detectKeywordTasks } from "@/lib/keywordTasks";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Segment = { start_ms: number; end_ms: number; text: string; speaker: string };
type LiveTask = { title: string; assignee?: string; ts?: number; thumbnail?: string; source: "keyword" | "ai" };

export default function LiveMeeting() {
  const nav = useNavigate();
  const [title, setTitle] = useState("Untitled meeting");
  const [language, setLanguage] = useState("en");
  const [isLeadership, setIsLeadership] = useState(false);
  const [meetingId, setMeetingId] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [summary, setSummary] = useState("");
  const [tasks, setTasks] = useState<LiveTask[]>([]);
  const [shotCount, setShotCount] = useState(0);
  const handlesRef = useRef<RecorderHandles | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const lastShotRef = useRef<{ phash: string; ts: number } | null>(null);
  const aiTickRef = useRef<number>(0);
  const vocabRef = useRef<string[]>([]);
  const transcribeErrorShownRef = useRef(false);
  const aiErrorShownRef = useRef(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("vocabulary").select("term");
      vocabRef.current = (data ?? []).map((v) => v.term);
    })();
  }, []);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed(Date.now() - (handlesRef.current?.startedAt ?? Date.now())), 500);
    return () => clearInterval(t);
  }, [recording]);

  // Screenshot loop (every 4s, only save on significant change)
  useEffect(() => {
    if (!recording || !meetingId) return;
    const userIdPromise = supabase.auth.getUser().then((r) => r.data.user!.id);
    const iv = setInterval(async () => {
      const h = handlesRef.current;
      if (!h?.videoEl) return;
      const frame = await captureFrame(h.videoEl);
      if (!frame) return;
      const ts = Date.now() - h.startedAt;
      const last = lastShotRef.current;
      if (last && hammingDistance(last.phash, frame.phash) < 12) return; // not a slide change
      lastShotRef.current = { phash: frame.phash, ts };
      try {
        const enc = await encryptBlob(frame.blob);
        const userId = await userIdPromise;
        const path = `${userId}/${meetingId}/${ts}.jpg.enc`;
        const { error: upErr } = await supabase.storage.from("meeting-screenshots").upload(path, enc.blob, { contentType: "application/octet-stream", upsert: true });
        if (upErr) throw upErr;
        await supabase.from("screenshots").insert({
          meeting_id: meetingId, storage_path: `${path}::${enc.iv}`, timestamp_ms: ts, hash: enc.hash,
        });
        setShotCount((c) => c + 1);
      } catch (e: any) { console.warn("screenshot failed", e); }
    }, 4000);
    return () => clearInterval(iv);
  }, [recording, meetingId]);

  async function start() {
    if (!title.trim()) return toast.error("Give your meeting a title");
    try {
      const { data: m, error } = await supabase.from("meetings").insert({
        user_id: (await supabase.auth.getUser()).data.user!.id,
        title: title.trim(), language, status: "live", is_leadership: isLeadership,
        started_at: new Date().toISOString(),
      }).select().single();
      if (error) throw error;
      setMeetingId(m.id);

      const handles = await startMeetingCapture({
        chunkMs: 6000,
        onChunk: async (blob, startMs, endMs) => {
          try {
            const result = await transcribe(blob, {
              language: language === "auto" ? undefined : language,
              prompt: vocabRef.current.slice(0, 50).join(", "),
            });
            const text = result.text?.trim();
            if (!text) return;
            const seg: Segment = { start_ms: startMs, end_ms: endMs, text, speaker: "Mic" };
            setSegments((prev) => [...prev, seg]);
            // store encrypted segment
            const { ciphertext, iv } = await encryptText(text);
            const hash = await sha256Hex(text);
            await supabase.from("transcript_segments").insert({
              meeting_id: m.id, start_ms: startMs, end_ms: endMs, speaker: "Mic",
              text_encrypted: ciphertext, text_iv: iv, text_hash: hash,
            });
            // every ~5 chunks (~30s) refresh AI sidebar
            aiTickRef.current++;
            if (aiTickRef.current % 5 === 0) {
              refreshAI();
            }
          } catch (e: any) {
            console.error("transcribe failed", e);
            if (!transcribeErrorShownRef.current) {
              transcribeErrorShownRef.current = true;
              toast.error(`Transcription failed: ${e.message ?? e}`, {
                description: "Check Settings → AI provider. Subsequent failures are silenced.",
                duration: 8000,
              });
            }
          }
        },
        onError: (e) => toast.error(e.message),
      });
      handlesRef.current = handles;
      // attach screen preview
      if (handles.videoEl && previewRef.current) {
        previewRef.current.innerHTML = "";
        handles.videoEl.className = "w-full h-full object-contain bg-black rounded-md";
        previewRef.current.appendChild(handles.videoEl);
      }
      setRecording(true);
      toast.success("Recording started");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to start");
    }
  }

  async function refreshAI() {
    const transcriptText = segments.concat([]).map((s) => `[${fmtTime(s.start_ms)}] ${s.speaker}: ${s.text}`).join("\n");
    if (!transcriptText) return;
    const [sum, items] = await Promise.all([
      rollingSummary(transcriptText, language).catch((e) => {
        console.error("[summary]", e);
        if (!aiErrorShownRef.current) {
          aiErrorShownRef.current = true;
          toast.error(`AI summary failed: ${e.message ?? e}`, { duration: 8000 });
        }
        return "";
      }),
      extractItems(transcriptText, vocabRef.current, language).catch((e) => {
        console.error("[extract]", e);
        if (!aiErrorShownRef.current) {
          aiErrorShownRef.current = true;
          toast.error(`Task extraction failed: ${e.message ?? e}`, { duration: 8000 });
        }
        return null;
      }),
    ]);
    if (sum) setSummary(sum);
    if (items) {
      setTasks(items.tasks.map((t) => ({ title: t.title, assignee: t.assignee, ts: t.timestamp_ms })));
    }
  }

  async function stop() {
    if (!handlesRef.current || !meetingId) return;
    setStopping(true);
    try {
      await supabase.from("meetings").update({ status: "processing" }).eq("id", meetingId);
      const { fullBlob, durationMs, mimeType } = await handlesRef.current.stop();
      // Encrypt and upload full audio
      const enc = await encryptBlob(fullBlob);
      const userId = (await supabase.auth.getUser()).data.user!.id;
      const path = `${userId}/${meetingId}/audio.${mimeType.split("/")[1].split(";")[0]}.enc`;
      const { error: upErr } = await supabase.storage.from("meeting-audio").upload(path, enc.blob, { contentType: "application/octet-stream", upsert: true });
      if (upErr) throw upErr;
      // Final extraction
      const transcriptText = segments.map((s) => `[${fmtTime(s.start_ms)}] ${s.speaker}: ${s.text}`).join("\n");
      const items = transcriptText ? await extractItems(transcriptText, vocabRef.current, language).catch(() => null) : null;
      const finalSum = transcriptText ? await rollingSummary(transcriptText, language).catch(() => "") : "";
      if (finalSum) {
        const { ciphertext, iv } = await encryptText(finalSum);
        await supabase.from("summaries").insert({ meeting_id: meetingId, kind: "final", content_encrypted: ciphertext, content_iv: iv });
      }
      if (items) {
        if (items.tasks.length) {
          await supabase.from("tasks").insert(items.tasks.map((t) => ({
            meeting_id: meetingId, user_id: userId, title: t.title, description: t.description,
            assignee_email: t.assignee?.includes("@") ? t.assignee : null,
            assignee_name: t.assignee && !t.assignee.includes("@") ? t.assignee : null,
            due_date: t.due_date ? new Date(t.due_date).toISOString() : null,
            source_timestamp_ms: t.timestamp_ms ?? null, confidence: t.confidence,
          })));
        }
        if (items.decisions.length) {
          await supabase.from("decisions").insert(items.decisions.map((d) => ({
            meeting_id: meetingId, text: d.text, source_timestamp_ms: d.timestamp_ms ?? null, confidence: d.confidence,
          })));
        }
        if (items.open_questions.length) {
          await supabase.from("open_questions").insert(items.open_questions.map((q) => ({
            meeting_id: meetingId, text: q.text, source_timestamp_ms: q.timestamp_ms ?? null,
          })));
        }
        // Update unresolved-topics tracker
        for (const topic of items.topics.slice(0, 8)) {
          const { data: existing } = await supabase.from("unresolved_topics").select("id, mention_count").eq("user_id", userId).ilike("topic", topic).maybeSingle();
          if (existing) {
            await supabase.from("unresolved_topics").update({ mention_count: existing.mention_count + 1, last_meeting_id: meetingId, last_seen_at: new Date().toISOString() }).eq("id", existing.id);
          } else {
            await supabase.from("unresolved_topics").insert({ user_id: userId, topic, last_meeting_id: meetingId });
          }
        }
      }
      await supabase.from("meetings").update({
        status: "completed", ended_at: new Date().toISOString(),
        duration_seconds: Math.round(durationMs / 1000),
        audio_path: `${path}::${enc.iv}`, audio_hash: enc.hash,
      }).eq("id", meetingId);
      toast.success("Meeting saved");
      nav(`/meetings/${meetingId}`);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to stop");
    } finally {
      setStopping(false);
      setRecording(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight">Live meeting</h1>
          <p className="text-sm text-muted-foreground mt-1">Capture mic + an optional shared tab. Transcribed via your chosen AI provider (Settings).</p>
        </div>
        {recording && (
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75 pulse-dot" /><span className="relative inline-flex rounded-full h-3 w-3 bg-destructive" /></span>
            <span className="font-mono text-sm tabular-nums">{fmtTime(elapsed)}</span>
          </div>
        )}
      </header>

      {!recording && !stopping && (
        <Card className="border-border/60">
          <CardHeader>
            <CardTitle>Setup</CardTitle>
            <CardDescription>Configure this meeting before recording</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            </div>
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="hi">Hindi</SelectItem>
                  <SelectItem value="auto">Auto-detect</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-3 flex items-center justify-between p-3 rounded-md bg-muted/40 border border-border/60">
              <div>
                <div className="text-sm font-medium">Leadership meeting</div>
                <div className="text-xs text-muted-foreground">Restrict access to leadership role members.</div>
              </div>
              <Switch checked={isLeadership} onCheckedChange={setIsLeadership} />
            </div>
            <div className="md:col-span-3">
              <Button variant="hero" size="lg" onClick={start}>
                <Mic className="h-4 w-4 mr-2" /> Start recording
              </Button>
              <p className="text-xs text-muted-foreground mt-2">You'll be prompted to share a tab with audio (recommended for Zoom/Meet/Teams in the browser).</p>
            </div>
          </CardContent>
        </Card>
      )}

      {(recording || stopping) && (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card className="border-border/60">
              <CardHeader className="flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base">Shared screen</CardTitle>
                  <CardDescription className="text-xs">Keyframes captured: {shotCount}</CardDescription>
                </div>
                <Badge variant="outline" className="text-xs"><ImageIcon className="h-3 w-3 mr-1" />keyframe diff</Badge>
              </CardHeader>
              <CardContent>
                <div ref={previewRef} className="aspect-video bg-black/60 rounded-md grid place-items-center text-xs text-muted-foreground">
                  {handlesRef.current?.videoEl ? null : "No screen shared (mic-only)"}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Live transcript</CardTitle>
                <CardDescription className="text-xs">Each line is timestamped + encrypted before storage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="max-h-[420px] overflow-auto scrollbar-thin space-y-2 font-mono text-sm pr-2">
                  {segments.length === 0 ? (
                    <p className="text-muted-foreground italic text-xs">Waiting for first chunk… (~6s)</p>
                  ) : segments.map((s, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-muted-foreground tabular-nums text-xs shrink-0 mt-0.5">{fmtTime(s.start_ms)}</span>
                      <span className="text-foreground/90">{s.text}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="border-border/60 bg-gradient-surface">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Rolling summary</CardTitle>
                </div>
                <CardDescription className="text-xs">Refreshes every ~30s via your Ollama</CardDescription>
              </CardHeader>
              <CardContent>
                {summary ? (
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{summary}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">Building…</p>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">Action items</CardTitle>
                <CardDescription className="text-xs">{tasks.length} detected so far</CardDescription>
              </CardHeader>
              <CardContent>
                {tasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">None yet</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {tasks.map((t, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-primary mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                        <div className="flex-1">
                          <div>{t.title}</div>
                          {(t.assignee || t.ts != null) && (
                            <div className="text-xs text-muted-foreground">
                              {t.assignee && <span>{t.assignee}</span>}
                              {t.ts != null && <span> · {fmtTime(t.ts)}</span>}
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Button variant="danger" size="lg" onClick={stop} disabled={stopping} className="w-full">
              {stopping ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</> : <><Square className="h-4 w-4 mr-2" />Stop & process</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
