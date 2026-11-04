"use client"

import * as React from "react"
import { type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Toolbar as ToolbarPrimitive } from "radix-ui"

import { Button, buttonVariants } from "@/components/ui/button"
import { toggleVariants } from "@/components/ui/toggle"

// A row of controls with one tab stop: Tab enters at the last focused control, Left/Right
// (Up/Down when vertical) move between controls and wrap, Home/End jump to the ends (Radix).
// On phones the row scrolls sideways; from `md` it wraps.
function Toolbar({
  className,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Root> & {
  "aria-label": string
}) {
  return (
    <ToolbarPrimitive.Root
      data-slot="toolbar"
      className={cn(
        "flex items-center gap-2 overflow-x-auto scrollbar-thin *:shrink-0 md:flex-wrap md:overflow-visible data-vertical:flex-col data-vertical:items-stretch",
        className
      )}
      {...props}
    />
  )
}

/**
 * A Button that joins the toolbar's arrow-key focus. Wrap popover, menu and tooltip triggers
 * around it with their own `asChild`. With `asChild` and no `variant` or `size`, the child keeps
 * its own look, for triggers that bring one (a `SelectTrigger`).
 */
function ToolbarButton({
  className,
  variant,
  size,
  asChild = false,
  children,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Button> &
  VariantProps<typeof buttonVariants>) {
  if (asChild && variant === undefined && size === undefined) {
    return (
      <ToolbarPrimitive.Button asChild className={className} {...props}>
        {children}
      </ToolbarPrimitive.Button>
    )
  }
  return (
    <ToolbarPrimitive.Button asChild {...props}>
      <Button
        variant={variant ?? "ghost"}
        size={size ?? "default"}
        asChild={asChild}
        className={className}
      >
        {children}
      </Button>
    </ToolbarPrimitive.Button>
  )
}

function ToolbarLink({
  className,
  variant = "ghost",
  size = "default",
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Link> &
  VariantProps<typeof buttonVariants>) {
  return (
    <ToolbarPrimitive.Link
      data-slot="toolbar-link"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

function ToolbarToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.ToggleGroup>) {
  return (
    <ToolbarPrimitive.ToggleGroup
      data-slot="toolbar-toggle-group"
      className={cn("flex items-center gap-1", className)}
      {...props}
    />
  )
}

function ToolbarToggleItem({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.ToggleItem> &
  VariantProps<typeof toggleVariants>) {
  return (
    <ToolbarPrimitive.ToggleItem
      data-slot="toolbar-toggle-item"
      className={cn(toggleVariants({ variant, size }), className)}
      {...props}
    />
  )
}

function ToolbarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Separator>) {
  return (
    <ToolbarPrimitive.Separator
      data-slot="toolbar-separator"
      className={cn(
        "shrink-0 bg-border data-horizontal:my-1 data-horizontal:h-px data-horizontal:w-4 data-vertical:mx-1 data-vertical:h-4 data-vertical:w-px",
        className
      )}
      {...props}
    />
  )
}

export {
  Toolbar,
  ToolbarButton,
  ToolbarLink,
  ToolbarToggleGroup,
  ToolbarToggleItem,
  ToolbarSeparator,
}
