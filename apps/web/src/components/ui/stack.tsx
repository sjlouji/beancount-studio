import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// Lays children out in a column or a row with a gap from the spacing scale. It never draws
// anything. `min-w-0` lets truncating children work inside rows. For a responsive direction pass
// `className="md:flex-row"`; never reorder visually (`*-reverse`, `order`), or focus order
// stops matching what people see.
const stackVariants = cva("flex min-w-0", {
  variants: {
    direction: {
      column: "flex-col",
      row: "flex-row",
    },
    gap: {
      1: "gap-1",
      2: "gap-2",
      3: "gap-3",
      4: "gap-4",
      5: "gap-5",
      6: "gap-6",
      8: "gap-8",
    },
    align: {
      start: "items-start",
      center: "items-center",
      end: "items-end",
      stretch: "items-stretch",
      baseline: "items-baseline",
    },
    justify: {
      start: "justify-start",
      center: "justify-center",
      end: "justify-end",
      between: "justify-between",
    },
    wrap: {
      true: "flex-wrap",
    },
  },
})

function Stack({
  className,
  direction = "column",
  gap,
  align,
  justify,
  wrap,
  asChild = false,
  ...props
}: React.ComponentProps<"div"> & {
  direction?: "column" | "row"
  gap?: 1 | 2 | 3 | 4 | 5 | 6 | 8
  align?: "start" | "center" | "end" | "stretch" | "baseline"
  justify?: "start" | "center" | "end" | "between"
  wrap?: boolean
  asChild?: boolean
}) {
  const Comp = asChild ? Slot.Root : "div"

  return (
    <Comp
      data-slot="stack"
      data-direction={direction}
      className={cn(
        stackVariants({
          direction,
          // 16px between blocks in a column, 8px between controls in a row.
          gap: gap ?? (direction === "row" ? 2 : 4),
          align,
          justify,
          wrap,
        }),
        className
      )}
      {...props}
    />
  )
}

export { Stack }
