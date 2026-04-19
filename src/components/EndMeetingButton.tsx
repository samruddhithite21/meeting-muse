import { useState } from "react";
import { Square, Loader2 } from "lucide-react";
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
  const [open, setOpen] = useState(false);

  async function endIt() {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("meetings")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", meetingId);

      if (error) throw error;

      toast.success("Meeting ended");
      setOpen(false);
      onEnded?.();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to end meeting");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="danger"
        size={size}
        className={size === "icon" ? "h-7 w-7" : ""}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label="End meeting"
        title="End meeting"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>End this meeting?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark the meeting as completed. If a recording is still in progress in another tab, stop it from there to also save the audio and transcript.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              variant="danger"
              onClick={endIt}
              disabled={busy}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              End meeting
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
