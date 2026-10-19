import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// DESIGN.md buttons: every button is a {rounded.pill}; `lg` is the standard 16px/14×28 pill,
// `default` the compact pill, `sm`/`xs` toolbar sizes. The *-on-aubergine variants live on the
// aubergine frame (top bar, sidebar, bands).
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border-2 border-transparent bg-clip-padding font-bold whitespace-nowrap transition-all outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-press active:bg-primary-press",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--primary)_8%)] aria-expanded:bg-[color-mix(in_oklch,var(--secondary),var(--primary)_8%)]",
        outline:
          "border-primary bg-background text-primary hover:bg-secondary aria-expanded:bg-secondary",
        ghost:
          "hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30",
        link: "text-link underline-offset-4 hover:text-link-hover hover:underline",
        chip: "border border-border bg-background text-foreground hover:bg-muted aria-expanded:bg-muted",
        "outline-on-aubergine":
          "border-sidebar-foreground bg-transparent text-sidebar-foreground hover:bg-sidebar-accent aria-expanded:bg-sidebar-accent",
        "ghost-on-aubergine":
          "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-foreground",
      },
      size: {
        default:
          "h-10 gap-2 px-5 text-sm tracking-[0.144px] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-7 gap-1 px-3 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3.5 text-[13px] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-auto gap-2 px-7 py-3.5 text-base tracking-[0.2px] has-data-[icon=inline-end]:pr-6 has-data-[icon=inline-start]:pl-6",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
