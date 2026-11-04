import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "cn"

// DESIGN.md meter: a static gauge of a level within known bounds (budget used, storage taken).
// For a task under way use Progress (role="progressbar"). `low`, `high` and `optimum` mean what
// they mean on HTML <meter>: the value's region against the optimum's region picks the colour,
// positive in the optimum region, warning one region away, negative two away.
type MeterLevel = "optimum" | "suboptimum" | "poor" | "neutral"

const fillVariants = cva(
  "h-full w-full origin-left rounded-full transition-transform duration-200 ease-out motion-reduce:transition-none rtl:origin-right",
  {
    variants: {
      level: {
        optimum: "bg-positive",
        suboptimum: "bg-warning",
        poor: "bg-negative",
        neutral: "bg-primary",
      },
    },
  }
)

const valueVariants = cva("tabular w-10 shrink-0 text-right type-footnote", {
  variants: {
    level: {
      optimum: "text-positive",
      suboptimum: "text-warning-foreground dark:text-warning",
      poor: "text-negative",
      neutral: "text-muted-foreground",
    },
  },
})

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

/** 0 = below `low`, 1 = between `low` and `high` (inclusive), 2 = above `high`. */
function region(value: number, low: number, high: number) {
  if (value < low) return 0
  if (value > high) return 2
  return 1
}

/**
 * HTML <meter> levels, with one deliberate difference: the region is taken from the unclamped
 * value, so a value past `max` (124% of a budget) lands above `high` and reads as poor. HTML
 * clamps first, which would leave an over-budget value in the middle region.
 */
function meterLevel(value: number, min: number, max: number, low: number, high: number, optimum: number): Exclude<MeterLevel, "neutral"> {
  const lowBound = clamp(low, min, max)
  const highBound = clamp(high, lowBound, max)
  const distance = Math.abs(
    region(value, lowBound, highBound) - region(clamp(optimum, min, max), lowBound, highBound)
  )
  if (distance === 0) return "optimum"
  if (distance === 1) return "suboptimum"
  return "poor"
}

function Meter({
  value,
  min = 0,
  max = 1,
  low,
  high,
  optimum,
  tone = "auto",
  size = "default",
  formatValue,
  showValue = false,
  label,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  value: number
  min?: number
  max?: number
  low?: number
  high?: number
  optimum?: number
  /** `auto` colours by low/high/optimum; `neutral` is a primary fill for levels with no good or bad. */
  tone?: "auto" | "neutral"
  size?: "sm" | "default"
  /** Spoken value (`aria-valuetext`), e.g. "92% used, close to the limit". Defaults to the percentage. */
  formatValue?: (value: number) => string
  showValue?: boolean
  /** Accessible name; pass `aria-labelledby` instead when a visible label exists. */
  label?: string
}) {
  const span = max - min
  const fraction = span > 0 ? clamp((value - min) / span, 0, 1) : 0
  // The visible text keeps the real figure ("124%"); only the fill and aria-valuenow are capped.
  const percent = span > 0 ? Math.round(((value - min) / span) * 100) : 0
  const level: MeterLevel =
    tone === "neutral"
      ? "neutral"
      : meterLevel(value, min, max, low ?? min, high ?? max, optimum ?? (min + max) / 2)

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={clamp(value, min, max)}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={formatValue ? formatValue(value) : `${percent}%`}
      data-slot="meter"
      data-level={level}
      className={cn("flex w-full min-w-0 items-center gap-2", className)}
      {...props}
    >
      <div
        data-slot="meter-track"
        className={cn(
          "min-w-0 flex-1 overflow-hidden rounded-full bg-fill",
          size === "sm" ? "h-1" : "h-1.5"
        )}
      >
        <div
          data-slot="meter-fill"
          className={fillVariants({ level })}
          style={{ transform: `scaleX(${fraction})` }}
        />
      </div>
      {showValue && (
        // aria-valuetext already speaks the figure; the visible copy is for sighted readers.
        <span data-slot="meter-value" aria-hidden className={valueVariants({ level })}>
          {percent}%
        </span>
      )}
    </div>
  )
}

export { Meter }
