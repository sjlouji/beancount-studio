"use client"

import * as React from "react"
import { cn } from "cn"
import { Slider as SliderPrimitive } from "radix-ui"

// One thumb for a value, two for a range (APG Slider and Multi-Thumb Slider). Thumbs never cross:
// each one stops at its neighbour, reports the neighbour as its own limit, and Home / End take it
// to that limit (Radix alone would move the outermost thumb). Commit expensive work in
// `onValueCommit`, not `onValueChange`.

type SliderProps = Omit<React.ComponentProps<typeof SliderPrimitive.Root>, "preserveThumbOrder"> & {
  /** Names for each thumb; a range defaults to "Minimum" and "Maximum". */
  thumbLabels?: string[]
  /** Text read for a value ("£420", "80%"); use the same function for any visible label. */
  formatValue?: (value: number) => string
}

function Slider({
  className,
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  minStepsBetweenThumbs = 0,
  thumbLabels,
  formatValue,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: SliderProps) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue ?? [min])
  const values = value ?? uncontrolled
  const range = values.length > 1
  const gap = minStepsBetweenThumbs * step

  function change(next: number[]) {
    if (value === undefined) setUncontrolled(next)
    onValueChange?.(next)
  }

  function onThumbKeyDown(index: number, event: React.KeyboardEvent<HTMLSpanElement>) {
    if (!range || (event.key !== "Home" && event.key !== "End")) return
    // Handled here; preventDefault also stops the root's Home / End handler.
    event.preventDefault()
    if (props.disabled) return
    const target = event.key === "Home" ? (index > 0 ? values[index - 1]! + gap : min) : index < values.length - 1 ? values[index + 1]! - gap : max
    if (target === values[index]) return
    const next = values.map((current, i) => (i === index ? target : current))
    change(next)
    onValueCommit?.(next)
  }

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      {...props}
      // A range is a named group of thumbs; a single thumb takes the name itself.
      role={range ? "group" : undefined}
      aria-label={range ? ariaLabel : undefined}
      aria-labelledby={range ? ariaLabelledBy : undefined}
      value={values}
      onValueChange={change}
      onValueCommit={onValueCommit}
      min={min}
      max={max}
      step={step}
      minStepsBetweenThumbs={minStepsBetweenThumbs}
      preserveThumbOrder
      className={cn(
        "relative flex w-full cursor-pointer touch-none items-center select-none data-disabled:cursor-not-allowed data-disabled:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-40 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        className
      )}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow overflow-hidden rounded-4xl bg-fill data-[orientation=horizontal]:h-1 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1"
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute bg-primary data-disabled:bg-muted-foreground data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
        />
      </SliderPrimitive.Track>
      {values.map((thumbValue, index) => (
        <SliderPrimitive.Thumb
          // Thumbs keep their order, so the index is a stable identity.
          key={index}
          data-slot="slider-thumb"
          aria-label={range ? thumbLabels?.[index] : (thumbLabels?.[0] ?? ariaLabel)}
          aria-labelledby={range ? undefined : ariaLabelledBy}
          aria-valuetext={formatValue?.(thumbValue)}
          aria-valuemin={index > 0 ? values[index - 1] : min}
          aria-valuemax={index < values.length - 1 ? values[index + 1] : max}
          onKeyDown={(event) => onThumbKeyDown(index, event)}
          // `press` scales the thumb while held; position follows the pointer with no easing.
          className="press relative block size-5 shrink-0 rounded-full border border-border bg-card shadow-xs outline-none after:absolute after:-inset-3 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/40 data-disabled:pointer-events-none md:after:hidden"
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
export type { SliderProps }
