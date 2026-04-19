import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function DeleteMeetingButton({
  meetingId,
  onDeleted,
  size = "icon",
}: {
  meetingId: string;
  onDeleted?: () => void;
  size?: "icon" | "sm";
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function deleteIt() {
    setBusy(true);
    try {
      const results = await Promise.all([
        supabase.from("transcript_segments").delete().eq("meeting_id", meetingId),
        supabase.from("tasks").delete().eq("meeting_id", meetingId),
        supabase.from("decisions").delete().eq("meeting_id", meetingId),
        supabase.from("open_questions").delete().eq("meeting_id", meetingId),
        supabase.from("summaries").delete().eq("meeting_id", meetingId),
        supabase.from("screenshots").delete().eq("meeting_id", meetingId),
        supabase.from("meeting_participants").delete().eq("meeting_id", meetingId),
      ]);

      const childError = results.find((result) => result.error)?.error;
      if (childError) throw childError;

      const { error } = await supabase.from("meetings").delete().eq("id", meetingId);
      if (error) throw error;

      toast.success("Meeting deleted");
      setOpen(false);
      onDeleted?.();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete meeting");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size={size}
        className={size === "icon" ? "h-7 w-7 text-muted-foreground hover:text-destructive" : "text-muted-foreground hover:text-destructive"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label="Delete meeting"
        title="Delete meeting"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the meeting, transcript, tasks, decisions, and screenshots. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              variant="danger"
              onClick={deleteIt}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
