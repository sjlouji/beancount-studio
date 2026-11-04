import { cn } from "cn"
import { Loader2Icon } from "lucide-react"

/**
 * Decorative by default: inside a button or beside "Loading…" text the words already say what is
 * happening, and a second announcement only repeats them. Pass `label` when the spinner stands
 * alone, so assistive technology hears what is loading.
 */
function Spinner({ className, label, ...props }: React.ComponentProps<"svg"> & { label?: string }) {
  const a11y = label ? { role: "status", "aria-label": label } : { "aria-hidden": true }
  return <Loader2Icon data-slot="spinner" {...a11y} className={cn("size-4 animate-spin", className)} {...props} />
}

export { Spinner }
