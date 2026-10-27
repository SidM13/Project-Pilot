"use client";

import { useTransition } from "react";
import Link from "next/link";
import { ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { switchWorkspace } from "@/actions/workspace";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface Option {
  id: string;
  name: string;
  isDemo: boolean;
}

export function WorkspaceSwitcher({ active, options }: { active: Option; options: Option[] }) {
  const [pending, start] = useTransition();
  const choose = (id: string) =>
    start(async () => {
      const result = await switchWorkspace(id);
      if (result && !result.ok) toast.error(result.error);
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-nav-hover focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-nav-foreground">{active.name}</span>
          <span className="block text-[11px] text-nav-muted">{active.isDemo ? "Demo workspace" : "Workspace"}</span>
        </span>
        <ChevronsUpDown className="size-3.5 text-nav-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Switch workspace</DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => o.id !== active.id && choose(o.id)} className="justify-between">
            <span className="truncate">{o.name}</span>
            {o.isDemo && <span className="text-[11px] text-muted-foreground">Demo</span>}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/welcome">New workspace…</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
