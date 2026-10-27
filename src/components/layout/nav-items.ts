// Primary navigation. A section is listed only once it works end to end.
export const NAV_ITEMS = [
  { href: "/command-center", label: "Command Center" },
  { href: "/projects", label: "Projects" },
  { href: "/risk", label: "Risk Intelligence" },
  { href: "/simulator", label: "Decision Simulator" },
  { href: "/reports", label: "Reports" },
] as const;

export const SECONDARY_NAV_ITEMS = [{ href: "/team", label: "Team & capacity" }] as const;
