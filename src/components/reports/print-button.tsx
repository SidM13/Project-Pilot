"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog; choose "Save as PDF" to download. */
export function PrintButton({ label = "Download PDF" }: { label?: string }) {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <Printer /> {label}
    </Button>
  );
}
