"use client";

import Link from "next/link";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NAV_ITEMS, SECONDARY_NAV_ITEMS } from "./nav-items";

export function MobileNav() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation" className="text-nav-foreground hover:bg-nav-hover">
          <Menu />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {NAV_ITEMS.map((i) => (
          <DropdownMenuItem key={i.href} asChild>
            <Link href={i.href}>{i.label}</Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        {SECONDARY_NAV_ITEMS.map((i) => (
          <DropdownMenuItem key={i.href} asChild>
            <Link href={i.href}>{i.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
