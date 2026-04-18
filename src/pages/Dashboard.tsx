import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtRelative, fmtDuration } from "@/lib/format";
import { Mic, ListChecks, AlertCircle, CheckCircle2, Clock, TrendingDown, Plus, ArrowRight } from "lucide-react";
import { decryptText } from "@/lib/crypto";
import { useAuth } from "@/hooks/useAuth";

type TaskRow = {
  id: string; title: string; status: string; due_date: string | null;
  meeting_id: string; assignee_name: string | null;
};
type MeetingRow = {
  id: string; title: string; status: string; started_at: string | null;
  duration_seconds: number | null; is_leadership: boolean;
};
type TopicRow = { id: string; topic: string; mention_count: number; status: string };

export default function Dashboard() {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [topics, setTopics] = useState<TopicRow[]>([]);
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [m, t, top] = await Promise.all([
        supabase.from("meetings").select("id,title,status,started_at,duration_seconds,is_leadership").order("created_at", { ascending: false }).limit(6),
        supabase.from("tasks").select("id,title,status,due_date,meeting_id,assignee_name").in("status", ["pending", "in_progress", "overdue"]).order("created_at", { ascending: false }).limit(20),
        supabase.from("unresolved_topics").select("id,topic,mention_count,status").eq("status", "unresolved").order("mention_count", { ascending: false }).limit(5),
      ]);
      setMeetings(m.data ?? []);
      setTasks(t.data ?? []);
      setTopics(top.data ?? []);
      // last meeting's most recent summary
      const lastMeeting = (m.data ?? [])[0];
      if (lastMeeting) {
        const { data: sum } = await supabase
          .from("summaries")
          .select("content_encrypted, content_iv")
          .eq("meeting_id", lastMeeting.id)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (sum) {
          try { setLastSummary(await decryptText(sum.content_encrypted, sum.content_iv)); } catch { /* key locked */ }
        }
      }
    })();
  }, [user]);

  const counts = {
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    overdue: tasks.filter((t) => t.status === "overdue").length,
  };

  return (
    <div className="relative">
      <div className="absolute inset-0 bg-aurora pointer-events-none" />
      <div className="relative p-6 md:p-8 max-w-7xl mx-auto space-y-6 animate-fade-in">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tight">
              Welcome back<span className="text-gradient">.</span>
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Your meeting operating system at a glance</p>
          </div>
          <Link to="/live">
            <Button variant="hero" size="lg">
              <Mic className="h-4 w-4 mr-2" /> Start a meeting
            </Button>
          </Link>
        </header>

        {/* KPIs */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={<Clock className="h-4 w-4" />} label="Pending tasks" value={counts.pending} accent="text-foreground" />
          <Stat icon={<TrendingDown className="h-4 w-4" />} label="In progress" value={counts.in_progress} accent="text-primary" />
          <Stat icon={<AlertCircle className="h-4 w-4" />} label="Overdue" value={counts.overdue} accent="text-destructive" />
          <Stat icon={<ListChecks className="h-4 w-4" />} label="Open topics" value={topics.length} accent="text-warning" />
        </section>

        <section className="grid lg:grid-cols-3 gap-4">
          {/* Pre-meeting briefing */}
          <Card className="lg:col-span-2 border-border/60">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Pre-meeting briefing</CardTitle>
                  <CardDescription>Last meeting summary — review before your next call</CardDescription>
                </div>
                {meetings[0] && (
                  <Link to={`/meetings/${meetings[0].id}`}>
                    <Button variant="ghost" size="sm">Open <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button>
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {lastSummary ? (
                <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{lastSummary}</p>
              ) : meetings.length === 0 ? (
                <EmptyHint title="No meetings yet" hint="Start your first meeting to see summaries here." />
              ) : (
                <p className="text-sm text-muted-foreground italic">Summary not available yet (or vault locked).</p>
              )}
            </CardContent>
          </Card>

          {/* Unresolved topics */}
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-lg">Unresolved topics</CardTitle>
              <CardDescription>Recurring discussions across meetings</CardDescription>
            </CardHeader>
            <CardContent>
              {topics.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recurring topics detected yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {topics.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate">{t.topic}</span>
                      <Badge variant="outline" className="text-xs shrink-0">×{t.mention_count}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid lg:grid-cols-2 gap-4">
          {/* Tasks */}
          <Card className="border-border/60">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Your open tasks</CardTitle>
                <CardDescription>From recent meetings</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No open tasks. Nice.</p>
              ) : tasks.slice(0, 8).map((t) => (
                <div key={t.id} className="flex items-start gap-3 p-2.5 rounded-md hover:bg-muted/40 transition-colors">
                  <StatusDot status={t.status} />
                  <div className="flex-1 min-w-0">
                    <Link to={`/meetings/${t.meeting_id}`} className="text-sm font-medium hover:text-primary truncate block">
                      {t.title}
                    </Link>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                      {t.assignee_name && <span>{t.assignee_name}</span>}
                      {t.due_date && <span>· due {new Date(t.due_date).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Recent meetings */}
          <Card className="border-border/60">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Recent meetings</CardTitle>
                <CardDescription>Click to review</CardDescription>
              </div>
              <Link to="/meetings"><Button variant="ghost" size="sm">All <ArrowRight className="h-3.5 w-3.5 ml-1" /></Button></Link>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {meetings.length === 0 ? (
                <Link to="/live">
                  <Button variant="outline" size="sm" className="w-full">
                    <Plus className="h-4 w-4 mr-2" /> Start your first meeting
                  </Button>
                </Link>
              ) : meetings.map((m) => (
                <Link key={m.id} to={`/meetings/${m.id}`} className="flex items-center justify-between p-2.5 rounded-md hover:bg-muted/40 transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate flex items-center gap-2">
                      {m.title}
                      {m.is_leadership && <Badge variant="outline" className="text-[10px]">leadership</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {m.started_at ? fmtRelative(m.started_at) : "scheduled"} · {fmtDuration(m.duration_seconds)}
                    </div>
                  </div>
                  <MeetingStatusBadge status={m.status} />
                </Link>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent: string }) {
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
          {icon} {label}
        </div>
        <div className={`text-3xl font-display font-semibold mt-1 ${accent}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-muted-foreground",
    in_progress: "bg-primary",
    overdue: "bg-destructive",
    completed: "bg-success",
  };
  return <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${map[status] ?? "bg-muted-foreground"}`} />;
}

function MeetingStatusBadge({ status }: { status: string }) {
  if (status === "live") return <Badge variant="destructive" className="text-xs">live</Badge>;
  if (status === "processing") return <Badge variant="outline" className="text-xs">processing</Badge>;
  if (status === "completed") return <Badge variant="secondary" className="text-xs"><CheckCircle2 className="h-3 w-3 mr-1" />done</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

function EmptyHint({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="text-center py-6">
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground mt-1">{hint}</div>
    </div>
  );
}
