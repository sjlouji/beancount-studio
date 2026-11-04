import * as React from "react"
import { cn } from "cn"

import { VisuallyHidden } from "@/components/ui/visually-hidden"

// The first focusable element of a shell: hidden until focused, then a primary 8px button fixed
// at the top-left, above the top bar (z-30) and clear of the Mac app's traffic lights
// (`titlebar-area-x`). Keyboard-summoned, so it appears without animation. A plain `a`, not
// `next/link`, so the fragment never goes through client routing; the target is the shell's
// `main` with `tabIndex={-1}`, so focus lands in the content.
// Shown-state layout sits under `focus:` because it must override both `sr-only` and the
// `focus-within:not-sr-only` that VisuallyHidden adds (focus variants come later in the CSS).
// `no-drag` keeps it clickable where it overlaps the title bar's drag region.
function SkipLink({
  className,
  href = "#main-content",
  children = "Skip to content",
  ...props
}: React.ComponentProps<"a">) {
  return (
    <VisuallyHidden asChild focusable>
      <a
        data-slot="skip-link"
        href={href}
        className={cn(
          "rounded-md bg-primary type-subhead font-semibold text-primary-foreground outline-none [-webkit-app-region:no-drag] focus:fixed focus:shadow-md focus:top-[calc(0.375rem+env(safe-area-inset-top))] focus:left-[max(1rem,env(titlebar-area-x,0px))] focus:z-50 focus:inline-flex focus:h-8 focus:items-center focus:px-3 focus:whitespace-nowrap focus-visible:ring-3 focus-visible:ring-ring/40",
          className
        )}
        {...props}
      >
        {children}
      </a>
    </VisuallyHidden>
  )
}

export { SkipLink }
