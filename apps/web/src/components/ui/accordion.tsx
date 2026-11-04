"use client"

import * as React from "react"
import { cn } from "cn"
import { Accordion as AccordionPrimitive } from "radix-ui"
import { ChevronRightIcon } from "lucide-react"

// A set of headed sections, each opening its own panel; Up/Down/Home/End move between the
// headers (Radix). Items are divided by hairlines; callers that stack items as separate cards
// pass their own item classes. The panel reuses the collapsible keyframes on `ease-drawer`;
// under reduced motion it opens and closes at once.
function Accordion({
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root>) {
  return <AccordionPrimitive.Root data-slot="accordion" {...props} />
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  )
}

type HeadingLevel = 2 | 3 | 4 | 5 | 6

function AccordionTrigger({
  className,
  children,
  headingLevel = 3,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger> & {
  /** The header is an h3; pick the level the page outline needs. */
  headingLevel?: HeadingLevel
}) {
  const Heading = `h${headingLevel}` as const
  return (
    <AccordionPrimitive.Header asChild>
      <Heading data-slot="accordion-header" className="flex">
        <AccordionPrimitive.Trigger
          data-slot="accordion-trigger"
          className={cn(
            "group/accordion-trigger press flex min-h-11 flex-1 items-center gap-2 rounded-md px-4 py-3 text-left type-headline text-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50 md:min-h-0",
            className
          )}
          {...props}
        >
          <ChevronRightIcon
            aria-hidden
            className="pointer-events-none size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-drawer group-aria-expanded/accordion-trigger:rotate-90 motion-reduce:transition-none"
          />
          {children}
        </AccordionPrimitive.Trigger>
      </Heading>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden type-subhead duration-200 ease-drawer data-closed:animate-collapsible-up data-open:animate-collapsible-down motion-reduce:animate-none"
      {...props}
    >
      <div className={cn("px-4 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Content>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
