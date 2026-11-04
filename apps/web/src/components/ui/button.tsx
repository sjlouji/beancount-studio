import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// DESIGN.md buttons: Apple rounded-rectangle controls in monochrome. `default` is the one filled
// primary button per view (black in light, white in dark), `secondary` Apple's grey button,
// `outline` the hairline control, `ghost` the toolbar control, `chip` the capsule filter.
// `destructive` is an outline button with red text; inside a dialog's footer it is the final
// confirm and turns solid red (the only solid red in the interface). Feedback is on the press
// itself (scale on :active), never a colour flash on release.
const buttonVariants = cva(
  "group/button press inline-flex shrink-0 items-center justify-center rounded-md border border-transparent font-semibold whitespace-nowrap outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-press",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_srgb,var(--secondary),var(--primary)_12%)] aria-expanded:bg-[color-mix(in_srgb,var(--secondary),var(--primary)_12%)]",
        outline:
          "border-border bg-background text-foreground shadow-xs hover:bg-accent aria-expanded:bg-accent",
        ghost:
          "hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground",
        destructive:
          "border-border bg-background text-negative shadow-xs hover:bg-negative/10 focus-visible:ring-destructive/30 in-data-[slot=alert-dialog-footer]:border-transparent in-data-[slot=alert-dialog-footer]:bg-negative in-data-[slot=alert-dialog-footer]:text-negative-foreground in-data-[slot=alert-dialog-footer]:shadow-none in-data-[slot=alert-dialog-footer]:hover:bg-negative/90 in-data-[slot=dialog-footer]:border-transparent in-data-[slot=dialog-footer]:bg-negative in-data-[slot=dialog-footer]:text-negative-foreground in-data-[slot=dialog-footer]:shadow-none in-data-[slot=dialog-footer]:hover:bg-negative/90",
        link: "text-link underline-offset-4 hover:text-link-hover hover:underline",
        chip: "rounded-full border-border bg-background text-foreground hover:bg-accent aria-expanded:bg-accent",
      },
      size: {
        default:
          "h-8 gap-1.5 px-3 text-[13px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1.5 rounded-md px-2.5 text-[13px] has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 rounded-[10px] px-4 text-[15px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        icon: "size-8",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-7 rounded-md",
        "icon-lg": "size-10 rounded-[10px]",
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
