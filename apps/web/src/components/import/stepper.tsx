import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Horizontal numbered stepper. Completed steps may be clicked to go back via `onSelect`. */
export function Stepper({ steps, current, onSelect }: { steps: Array<{ label: string; hint: string }>; current: number; onSelect?: (index: number) => void }) {
  return (
    <ol className="grid grid-cols-3 gap-2 animate-rise [animation-delay:90ms]" aria-label="Progress">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const clickable = done && onSelect;
        const body = (
          <>
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular transition-colors",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-primary ring-4 ring-primary/15",
                !done && !active && "text-muted-foreground",
              )}
            >
              {done ? <CheckIcon className="size-3.5" /> : index + 1}
            </span>
            <span className="min-w-0 text-left">
              <span className={cn("block truncate text-sm font-medium", !active && !done && "text-muted-foreground")}>{step.label}</span>
              <span className="hidden truncate text-xs text-muted-foreground sm:block">{step.hint}</span>
            </span>
          </>
        );
        return (
          <li key={step.label} aria-current={active ? "step" : undefined} className="relative">
            {clickable ? (
              <button type="button" onClick={() => onSelect(index)} className="flex w-full items-center gap-2.5 rounded-lg p-1.5 hover:bg-muted">
                {body}
              </button>
            ) : (
              <div className="flex items-center gap-2.5 p-1.5">{body}</div>
            )}
            <span className={cn("absolute inset-x-1.5 -bottom-1 h-0.5 rounded-full", done || active ? "bg-primary" : "bg-border", active && "bg-primary/50")} aria-hidden />
          </li>
        );
      })}
    </ol>
  );
}
