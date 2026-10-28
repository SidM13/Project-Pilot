"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DEFAULT_SUGGESTIONS = ["Which projects are at risk of missing their deadlines?", "Which tasks should I prioritize this week?", "Which team members are overloaded?"];

/** Entry point to the AI Copilot from anywhere: sends the question to /copilot. */
export function AskBar({ suggestions = DEFAULT_SUGGESTIONS, className }: { suggestions?: string[]; className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const go = (question: string) => question.trim() && router.push(`/copilot?q=${encodeURIComponent(question.trim())}`);
  return (
    <section aria-label="Ask the AI Copilot" className={cn("rounded-lg border bg-card p-4", className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
        className="flex items-center gap-2 rounded-md border bg-background px-3 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15"
      >
        <Sparkles aria-hidden className="size-4 shrink-0 text-primary" strokeWidth={1.75} />
        <label htmlFor="ask-bar" className="sr-only">Ask about your projects</label>
        <input
          id="ask-bar"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask about your projects — deadlines, budget, workload, what-ifs…"
          className="h-11 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
          autoComplete="off"
        />
        <Button type="submit" size="icon-sm" disabled={!q.trim()} aria-label="Ask">
          <ArrowUp />
        </Button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => go(s)}
            className="rounded-full border bg-subtle px-3 py-1 text-xs text-foreground/80 transition-colors hover:border-primary/40 hover:bg-info-soft hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </section>
  );
}
