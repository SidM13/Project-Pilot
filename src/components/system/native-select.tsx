import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Native <select> styled like Input — accessible and form-friendly. */
export function NativeSelect({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <span className={cn("relative block", className)}>
      <select
        {...props}
        className="h-8 w-full appearance-none rounded-md border border-input bg-card pr-8 pl-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:opacity-50 aria-invalid:border-destructive"
      >
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </span>
  );
}
