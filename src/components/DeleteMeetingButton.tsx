import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Permanently deletes a meeting (and cascades related rows via FK).
 */
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

  async function deleteIt(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      // Best-effort cleanup of child rows (in case FK cascade isn't set)
      await Promise.all([
        supabase.from("transcript_segments").delete().eq("meeting_id", meetingId),
        supabase.from("tasks").delete().eq("meeting_id", meetingId),
        supabase.from("decisions").delete().eq("meeting_id", meetingId),
        supabase.from("open_questions").delete().eq("meeting_id", meetingId),
        supabase.from("summaries").delete().eq("meeting_id", meetingId),
        supabase.from("screenshots").delete().eq("meeting_id", meetingId),
        supabase.from("meeting_participants").delete().eq("meeting_id", meetingId),
      ]);
      const { error } = await supabase.from("meetings").delete().eq("id", meetingId);
      if (error) throw error;
      toast.success("Meeting deleted");
      onDeleted?.();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete meeting");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          className={size === "icon" ? "h-7 w-7 text-muted-foreground hover:text-destructive" : "text-muted-foreground hover:text-destructive"}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          aria-label="Delete meeting"
          title="Delete meeting"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this meeting?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes the meeting, transcript, tasks, decisions, and screenshots. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={deleteIt} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
