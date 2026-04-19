import { useState } from "react";
import { Square, Loader2 } from "lucide-react";
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
 * Quick-end button shown in lists (e.g. Dashboard "Recent meetings").
 * Marks the meeting completed without running post-processing — used when
 * a meeting was abandoned/orphaned in `live` state.
 */
export function QuickEndMeetingButton({
  meetingId,
  onEnded,
  size = "icon",
}: {
  meetingId: string;
  onEnded?: () => void;
  size?: "icon" | "sm";
}) {
  const [busy, setBusy] = useState(false);

  async function endIt(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    try {
      const { error } = await supabase
        .from("meetings")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", meetingId);
      if (error) throw error;
      toast.success("Meeting ended");
      onEnded?.();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to end meeting");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="danger"
          size={size}
          className={size === "icon" ? "h-7 w-7" : ""}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          aria-label="End meeting"
          title="End meeting"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>End this meeting?</AlertDialogTitle>
          <AlertDialogDescription>
            This will mark the meeting as completed. If a recording is still in progress in another tab,
            stop it from there to also save the audio &amp; transcript.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={endIt} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            End meeting
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
