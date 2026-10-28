import { FileText, FolderKanban, House, Sparkles, type LucideIcon } from "lucide-react";

// Primary navigation: four destinations. A section is listed only once it works end to end.
// `match` lists other routes that belong to a destination (for the active state).
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", icon: House, match: ["/home", "/risk"] },
  { href: "/projects", label: "Projects", icon: FolderKanban, match: ["/projects", "/team"] },
  { href: "/copilot", label: "AI Copilot", icon: Sparkles, match: ["/copilot", "/simulator"] },
  { href: "/reports", label: "Reports", icon: FileText, match: ["/reports"] },
];

export function isNavActive(item: NavItem, pathname: string) {
  const path = pathname.replace(/\/$/, "") || "/";
  return item.match.some((m) => path === m || path.startsWith(`${m}/`));
}
