import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, Lock, Server, Cpu, ShieldAlert } from "lucide-react";
import { pingOllama, pingWhisper, clearAIConfigCache } from "@/lib/aiClient";
import { lockKey } from "@/lib/crypto";

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [s, setS] = useState({
    ollama_url: "http://localhost:11434",
    ollama_model: "llama3.1",
    whisper_url: "http://localhost:8000",
    whisper_model: "base",
    leadership_mode: false,
    email_digest: true,
  });
  const [profile, setProfile] = useState({ display_name: "", language: "en" });
  const [ollamaStatus, setOllamaStatus] = useState<"idle" | "ok" | "fail" | "checking">("idle");
  const [whisperStatus, setWhisperStatus] = useState<"idle" | "ok" | "fail" | "checking">("idle");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const [{ data: settings }, { data: prof }] = await Promise.all([
        supabase.from("user_settings").select("*").maybeSingle(),
        supabase.from("profiles").select("display_name, language").maybeSingle(),
      ]);
      if (settings) setS({
        ollama_url: settings.ollama_url, ollama_model: settings.ollama_model,
        whisper_url: settings.whisper_url, whisper_model: settings.whisper_model,
        leadership_mode: settings.leadership_mode, email_digest: settings.email_digest,
      });
      if (prof) setProfile({ display_name: prof.display_name ?? "", language: prof.language });
      setLoading(false);
    })();
  }, []);

  async function save() {
    setBusy(true);
    try {
      const userId = (await supabase.auth.getUser()).data.user!.id;
      await Promise.all([
        supabase.from("user_settings").upsert({ user_id: userId, ...s }),
        supabase.from("profiles").upsert({ user_id: userId, display_name: profile.display_name, language: profile.language }),
      ]);
      clearAIConfigCache();
      toast.success("Settings saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function testOllama() {
    setOllamaStatus("checking");
    clearAIConfigCache();
    const r = await pingOllama();
    setOllamaStatus(r.ok ? "ok" : "fail");
    if (r.ok && r.models) setOllamaModels(r.models);
    if (!r.ok) toast.error(`Ollama: ${r.error}`);
  }

  async function testWhisper() {
    setWhisperStatus("checking");
    clearAIConfigCache();
    const r = await pingWhisper();
    setWhisperStatus(r.ok ? "ok" : "fail");
    if (!r.ok) toast.error(`Whisper: ${r.error}`);
  }

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-display font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure your local AI bridge, profile, and security</p>
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" />
            <CardTitle>Local Ollama</CardTitle>
          </div>
          <CardDescription>
            Start with <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">OLLAMA_ORIGINS="*" ollama serve</code> so the browser can reach it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Endpoint URL</Label>
              <Input value={s.ollama_url} onChange={(e) => setS({ ...s, ollama_url: e.target.value })} placeholder="http://localhost:11434" />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              {ollamaModels.length > 0 ? (
                <Select value={s.ollama_model} onValueChange={(v) => setS({ ...s, ollama_model: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ollamaModels.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={s.ollama_model} onChange={(e) => setS({ ...s, ollama_model: e.target.value })} placeholder="llama3.1" />
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={testOllama} disabled={ollamaStatus === "checking"}>
              {ollamaStatus === "checking" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Server className="h-4 w-4 mr-2" />}
              Test connection
            </Button>
            {ollamaStatus === "ok" && <span className="text-success text-sm flex items-center gap-1"><CheckCircle2 className="h-4 w-4" /> Connected</span>}
            {ollamaStatus === "fail" && <span className="text-destructive text-sm flex items-center gap-1"><XCircle className="h-4 w-4" /> Failed</span>}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Cpu className="h-5 w-5 text-primary" />
            <CardTitle>Local Whisper</CardTitle>
          </div>
          <CardDescription>
            Use any OpenAI-compatible Whisper server (e.g. <code className="px-1 py-0.5 rounded bg-muted text-xs font-mono">faster-whisper-server</code>) with CORS enabled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Endpoint URL</Label>
              <Input value={s.whisper_url} onChange={(e) => setS({ ...s, whisper_url: e.target.value })} placeholder="http://localhost:8000" />
            </div>
            <div className="space-y-2">
              <Label>Model</Label>
              <Input value={s.whisper_model} onChange={(e) => setS({ ...s, whisper_model: e.target.value })} placeholder="base / small / medium / large-v3" />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={testWhisper} disabled={whisperStatus === "checking"}>
            {whisperStatus === "checking" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Server className="h-4 w-4 mr-2" />}
            Test connection
          </Button>
          {whisperStatus === "ok" && <span className="ml-3 text-success text-sm">Reachable</span>}
          {whisperStatus === "fail" && <span className="ml-3 text-destructive text-sm">Failed</span>}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Display name</Label>
            <Input value={profile.display_name} maxLength={100} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Default language</Label>
            <Select value={profile.language} onValueChange={(v) => setProfile({ ...profile, language: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="hi">Hindi</SelectItem>
                <SelectItem value="auto">Auto-detect</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" />
            <CardTitle>Security & notifications</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-md bg-muted/40 border border-border/60">
            <div>
              <div className="text-sm font-medium">Leadership mode</div>
              <div className="text-xs text-muted-foreground">Mark new meetings as leadership-only by default. Adds stricter access checks.</div>
            </div>
            <Switch checked={s.leadership_mode} onCheckedChange={(v) => setS({ ...s, leadership_mode: v })} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-md bg-muted/40 border border-border/60">
            <div>
              <div className="text-sm font-medium">Daily email digest</div>
              <div className="text-xs text-muted-foreground">Receive a daily roll-up of pending tasks and open questions.</div>
            </div>
            <Switch checked={s.email_digest} onCheckedChange={(v) => setS({ ...s, email_digest: v })} />
          </div>
          <Button variant="outline" size="sm" onClick={() => { lockKey(); toast.success("Vault locked. Reload to re-enter passphrase."); }}>
            <Lock className="h-4 w-4 mr-2" /> Lock vault
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="hero" size="lg" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
