import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Content lists. `bullet` is a bulleted (or, with `ordered`, numbered) list in body text with
// muted markers and 12px around it in prose. `plain` drops markers and indent; `divided` adds
// hairlines between items and pads each item instead of a gap. Both set `role="list"`, because
// WebKit drops list semantics once `list-style` is none. An empty list renders EmptyState, never
// an empty `ul`. Items are not focusable; arrow-key navigation is a Listbox, not this.
const listVariants = cva("", {
  variants: {
    variant: {
      bullet: "my-3 pl-5 type-body marker:text-muted-foreground first:mt-0 last:mb-0",
      plain: "list-none",
      divided: "list-none divide-y divide-border *:py-2.5",
    },
    gap: {
      1: "space-y-1",
      2: "space-y-2",
      3: "space-y-3",
    },
  },
})

function List({
  className,
  ordered = false,
  variant = "bullet",
  gap = 1,
  asChild = false,
  ...props
}: React.ComponentProps<"ul"> & {
  ordered?: boolean
  variant?: "bullet" | "plain" | "divided"
  gap?: 1 | 2 | 3
  asChild?: boolean
}) {
  // `ul` and `ol` take the same attributes but differ in their ref type, so the element is
  // widened (an annotation alone would be narrowed back to the union).
  const Comp = (asChild ? Slot.Root : ordered ? "ol" : "ul") as React.ElementType

  return (
    <Comp
      data-slot="list"
      data-variant={variant}
      role={variant === "bullet" ? undefined : "list"}
      className={cn(
        // Divided items are spaced by their padding, so the gap does not apply there.
        listVariants({ variant, gap: variant === "divided" ? undefined : gap }),
        variant === "bullet" && (ordered ? "list-decimal" : "list-disc"),
        className
      )}
      {...props}
    />
  )
}

function ListItem({ className, ...props }: React.ComponentProps<"li">) {
  return <li data-slot="list-item" className={cn(className)} {...props} />
}

// Term and value pairs. Wrap each `dt`/`dd` pair in a `div` (HTML allows it): the layouts style
// those groups. `stacked` puts the term above the value, `inline` the term left and the value
// right on hairline-divided rows, `grid` 2 to 4 columns of stacked pairs from `lg` (one column
// below, like every grid).
const descriptionListVariants = cva("", {
  variants: {
    layout: {
      stacked: "flex flex-col gap-3 *:flex *:flex-col *:gap-0.5",
      inline:
        "flex flex-col divide-y divide-border *:flex *:items-baseline *:justify-between *:gap-4 *:py-2.5 [&_dd]:text-right",
      grid: "grid gap-x-6 gap-y-4 *:flex *:min-w-0 *:flex-col *:gap-0.5",
    },
    columns: {
      2: "lg:grid-cols-2",
      3: "lg:grid-cols-3",
      4: "lg:grid-cols-4",
    },
  },
})

function DescriptionList({
  className,
  layout = "stacked",
  columns = 2,
  ...props
}: React.ComponentProps<"dl"> & {
  layout?: "stacked" | "inline" | "grid"
  columns?: 2 | 3 | 4
}) {
  return (
    <dl
      data-slot="description-list"
      data-layout={layout}
      className={cn(
        descriptionListVariants({
          layout,
          columns: layout === "grid" ? columns : undefined,
        }),
        className
      )}
      {...props}
    />
  )
}

function DescriptionTerm({ className, ...props }: React.ComponentProps<"dt">) {
  return (
    <dt
      data-slot="description-term"
      className={cn("type-subhead text-muted-foreground", className)}
      {...props}
    />
  )
}

// Values are tabular; ledger names and hashes add `font-mono` at the call site.
function DescriptionDetails({ className, ...props }: React.ComponentProps<"dd">) {
  return (
    <dd
      data-slot="description-details"
      className={cn("tabular min-w-0 type-body text-foreground", className)}
      {...props}
    />
  )
}

export {
  List,
  ListItem,
  DescriptionList,
  DescriptionTerm,
  DescriptionDetails,
}
