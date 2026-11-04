import * as React from "react"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Hides content visually while keeping it in the accessibility tree. Built on the `sr-only`
// class rather than Radix VisuallyHidden, whose inline styles cannot be undone on focus or at a
// breakpoint. `focusable` reveals the content while it or a descendant has focus (the caller
// styles the shown state); never put a focusable element in a non-focusable VisuallyHidden.
// For responsive hiding keep using a class such as `max-sm:sr-only` directly.
function VisuallyHidden({
  className,
  asChild = false,
  focusable = false,
  ...props
}: React.ComponentProps<"span"> & {
  asChild?: boolean
  focusable?: boolean
}) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="visually-hidden"
      className={cn(
        "sr-only",
        focusable && "focus-within:not-sr-only",
        className
      )}
      {...props}
    />
  )
}

export { VisuallyHidden }
