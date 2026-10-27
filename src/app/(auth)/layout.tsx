export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="flex flex-col justify-between bg-nav px-8 py-10 text-nav-foreground lg:px-14">
        <div className="flex items-center gap-2">
          <span aria-hidden className="grid size-6 place-items-center rounded-[5px] bg-primary text-[11px] font-bold text-white">P</span>
          <span className="text-[14px] font-semibold tracking-tight">ProjectPilot</span>
        </div>
        <div className="my-12 max-w-md">
          <h1 className="font-serif text-[34px] leading-[1.15] font-semibold tracking-tight">Know what is at risk. Decide what to do next.</h1>
          <p className="mt-4 text-[14px] leading-6 text-nav-muted">
            For project leads at consulting and professional-services firms. ProjectPilot turns task, effort and spend records into ranked decisions, and shows the evidence and arithmetic behind each one.
          </p>
        </div>
        <p className="text-xs text-nav-muted">Prototype · Stanford Continuing Studies TECH 41</p>
      </div>
      <div className="flex items-center justify-center px-6 py-12">{children}</div>
    </div>
  );
}
