// Detects explicit task triggers in a transcript line.
// Triggers: "task", "assign", "action item" (case-insensitive, word-boundary).
// Tries to extract an assignee (the name immediately before/after the trigger)
// and a description (the rest of the sentence after the trigger / colon).

const TRIGGER_RE = /\b(task|assign(?:ed)?|action\s+item)\b/i;

export interface KeywordTask {
  title: string;
  assignee?: string;
  raw: string;
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

function cleanDesc(s: string) {
  return s
    .replace(/^[\s:,\-–—]+/, "")
    .replace(/[\s.]+$/, "")
    .replace(/^(to|for|please|kindly)\s+/i, "")
    .trim();
}

export function detectKeywordTasks(text: string): KeywordTask[] {
  if (!text) return [];
  const out: KeywordTask[] = [];
  // Split into rough sentences so multiple triggers in one chunk are handled.
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

  for (const sentence of sentences) {
    const m = sentence.match(TRIGGER_RE);
    if (!m) continue;

    const triggerIdx = m.index ?? 0;
    const before = sentence.slice(0, triggerIdx).trim();
    const after = sentence.slice(triggerIdx + m[0].length).trim();

    let assignee: string | undefined;
    let desc = "";

    // Pattern A: "Task for Sarah: Update the landing page"
    //            "Action item for Sarah - update the landing page"
    const forMatch = after.match(/^(?:for|to)\s+([A-Z][\w'’\-]*(?:\s+[A-Z][\w'’\-]*)?)\s*[:,\-–—]?\s*(.*)$/);
    if (forMatch) {
      assignee = forMatch[1];
      desc = cleanDesc(forMatch[2]);
    } else if (/^assign(ed)?$/i.test(m[0])) {
      // Pattern B: "Assign Sarah to update the landing page"
      const assignMatch = after.match(/^([A-Z][\w'’\-]*(?:\s+[A-Z][\w'’\-]*)?)\s+(?:to\s+)?(.*)$/);
      if (assignMatch) {
        assignee = assignMatch[1];
        desc = cleanDesc(assignMatch[2]);
      } else {
        desc = cleanDesc(after);
      }
    } else {
      // Pattern C: "Sarah, task: update the landing page"
      const beforeName = before.match(/([A-Z][\w'’\-]*(?:\s+[A-Z][\w'’\-]*)?)[\s,]*$/);
      if (beforeName) assignee = beforeName[1];
      desc = cleanDesc(after);
    }

    if (!desc) continue; // no actual description → skip
    out.push({ title: titleCase(desc.charAt(0).toLowerCase() + desc.slice(1)).slice(0, 140), assignee, raw: sentence });
  }

  return out;
}
