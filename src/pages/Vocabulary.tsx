import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, BookOpen } from "lucide-react";

type Term = { id: string; term: string; category: string | null; notes: string | null };

export default function Vocabulary() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");

  useEffect(() => { load(); }, []);
  async function load() {
    const { data } = await supabase.from("vocabulary").select("*").order("created_at", { ascending: false });
    setTerms(data ?? []);
  }
  async function add() {
    if (!term.trim()) return;
    const userId = (await supabase.auth.getUser()).data.user!.id;
    const { error } = await supabase.from("vocabulary").insert({ user_id: userId, term: term.trim(), category: category.trim() || null });
    if (error) return toast.error(error.message);
    setTerm(""); setCategory(""); load();
  }
  async function remove(id: string) {
    await supabase.from("vocabulary").delete().eq("id", id);
    load();
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-display font-semibold tracking-tight">Vocabulary</h1>
        <p className="text-sm text-muted-foreground mt-1">Names, jargon, and project keywords. Fed into Whisper and Ollama for better accuracy.</p>
      </div>
      <Card className="border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <CardTitle>Add term</CardTitle>
          </div>
          <CardDescription>e.g. "Skanda", "Kubernetes", "Project Aurora"</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Term" value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
            <Input placeholder="Category (optional)" value={category} onChange={(e) => setCategory(e.target.value)} className="sm:max-w-xs" />
            <Button variant="hero" onClick={add}><Plus className="h-4 w-4 mr-2" />Add</Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle>Your dictionary ({terms.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {terms.length === 0 ? (
            <p className="text-sm text-muted-foreground">No terms yet. Add domain-specific words above.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {terms.map((t) => (
                <div key={t.id} className="group flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full bg-muted/60 border border-border/60 hover:border-primary/40 transition-colors">
                  <span className="text-sm">{t.term}</span>
                  {t.category && <Badge variant="outline" className="text-[10px]">{t.category}</Badge>}
                  <Button variant="ghost" size="icon" className="h-6 w-6 opacity-50 group-hover:opacity-100" onClick={() => remove(t.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
