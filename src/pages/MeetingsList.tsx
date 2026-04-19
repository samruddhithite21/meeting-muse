import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtDuration, fmtRelative } from "@/lib/format";
import { Mic, Plus } from "lucide-react";
import { QuickEndMeetingButton } from "@/components/EndMeetingButton";
import { DeleteMeetingButton } from "@/components/DeleteMeetingButton";

type Row = { id: string; title: string; status: string; started_at: string | null; duration_seconds: number | null; is_leadership: boolean };

export default function MeetingsList() {
  const [items, setItems] = useState<Row[]>([]);
  useEffect(() => { (async () => {
    const { data } = await supabase.from("meetings").select("id,title,status,started_at,duration_seconds,is_leadership").order("created_at", { ascending: false });
    setItems(data ?? []);
  })(); }, []);

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight">All meetings</h1>
          <p className="text-sm text-muted-foreground mt-1">{items.length} total</p>
        </div>
        <Link to="/live"><Button variant="hero"><Mic className="h-4 w-4 mr-2" />New meeting</Button></Link>
      </div>

      {items.length === 0 ? (
        <Card className="border-border/60 border-dashed">
          <CardContent className="py-12 grid place-items-center text-center">
            <div className="h-12 w-12 rounded-full bg-muted grid place-items-center mb-3">
              <Plus className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">No meetings yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-4">Capture your first one to populate your dashboard.</p>
            <Link to="/live"><Button variant="hero" size="sm">Start meeting</Button></Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {items.map((m) => (
            <Card key={m.id} className="border-border/60 hover:border-primary/40 transition-colors">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <Link to={`/meetings/${m.id}`} className="min-w-0 flex-1">
                  <div className="font-medium truncate flex items-center gap-2">
                    {m.title}
                    {m.is_leadership && <Badge variant="outline" className="text-[10px]">leadership</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {m.started_at ? fmtRelative(m.started_at) : "scheduled"} · {fmtDuration(m.duration_seconds)}
                  </div>
                </Link>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant={m.status === "completed" ? "secondary" : m.status === "live" ? "destructive" : "outline"}>{m.status}</Badge>
                  {m.status === "live" && (
                    <QuickEndMeetingButton
                      meetingId={m.id}
                      onEnded={() => setItems((prev) => prev.map((x) => x.id === m.id ? { ...x, status: "completed" } : x))}
                    />
                  )}
                  <DeleteMeetingButton
                    meetingId={m.id}
                    onDeleted={() => setItems((prev) => prev.filter((x) => x.id !== m.id))}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
