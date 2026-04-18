import { useEffect, useState, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadStoredKey, unlockKey, getStoredFingerprint } from "@/lib/crypto";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, KeyRound } from "lucide-react";

export function EncryptionGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [hasFingerprint, setHasFingerprint] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const k = await loadStoredKey();
      if (k) {
        setUnlocked(true);
      } else {
        const { data } = await supabase.from("user_settings").select("encryption_key_fingerprint").maybeSingle();
        setHasFingerprint(data?.encryption_key_fingerprint ?? null);
      }
      setChecking(false);
    })();
  }, []);

  async function onUnlock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pass = (new FormData(e.currentTarget).get("passphrase") as string) ?? "";
    if (pass.length < 6) {
      toast.error("Passphrase must be at least 6 characters");
      return;
    }
    setBusy(true);
    try {
      const { fingerprint } = await unlockKey(pass);
      const { data } = await supabase.from("user_settings").select("encryption_key_fingerprint").maybeSingle();
      const stored = data?.encryption_key_fingerprint;
      if (stored && stored !== fingerprint) {
        toast.error("Wrong passphrase — fingerprint mismatch");
        setBusy(false);
        return;
      }
      if (!stored) {
        await supabase.from("user_settings").upsert({
          user_id: (await supabase.auth.getUser()).data.user!.id,
          encryption_key_fingerprint: fingerprint,
        });
        toast.success("Encryption key set for this account");
      } else {
        toast.success("Vault unlocked");
      }
      setUnlocked(true);
    } catch (err: any) {
      toast.error(err.message ?? "Failed to unlock");
    } finally {
      setBusy(false);
    }
  }

  if (checking) return null;
  if (unlocked) return <>{children}</>;

  return (
    <div className="grid place-items-center p-8 min-h-[60vh]">
      <Card className="max-w-md w-full border-border/60 shadow-elegant">
        <CardHeader>
          <div className="h-10 w-10 rounded-lg bg-gradient-primary grid place-items-center mb-2">
            <Shield className="h-5 w-5 text-primary-foreground" />
          </div>
          <CardTitle>{hasFingerprint ? "Unlock your vault" : "Set encryption passphrase"}</CardTitle>
          <CardDescription>
            {hasFingerprint
              ? "Enter the passphrase you used to set up this account. Meeting transcripts and recordings are encrypted on this device before upload."
              : "Choose a passphrase. It encrypts your meeting data end-to-end with AES-GCM. We never see it. Lose it = lose access to past meetings."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onUnlock}>
            <div className="space-y-2">
              <Label htmlFor="passphrase">Passphrase</Label>
              <Input id="passphrase" name="passphrase" type="password" minLength={6} required autoFocus />
            </div>
            <Button type="submit" variant="hero" className="w-full" disabled={busy}>
              <KeyRound className="h-4 w-4 mr-2" />
              {busy ? "Unlocking…" : hasFingerprint ? "Unlock" : "Create vault"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
