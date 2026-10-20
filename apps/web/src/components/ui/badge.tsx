import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Capsules: tinted fills, never loud. `secondary` is the grey fill, the status variants are the
// semantic tints (success, warning, destructive) with readable text on both canvases.
const badgeVariants = cva(
  "group/badge inline-flex h-[22px] w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary-press",
        secondary: "bg-fill text-foreground [a]:hover:bg-fill-secondary",
        success: "bg-positive/12 text-positive",
        warning: "bg-warning/14 text-warning",
        destructive:
          "bg-destructive/12 text-destructive focus-visible:ring-destructive/20 [a]:hover:bg-destructive/20",
        outline: "border-border text-foreground [a]:hover:bg-accent",
        ghost: "hover:bg-accent hover:text-foreground",
        link: "text-link underline-offset-4 hover:text-link-hover hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
