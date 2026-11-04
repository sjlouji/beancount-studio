"use client"

import * as React from "react"
import { cn } from "cn"
import { MinusIcon, PlusIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FieldError } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group"

// A small whole number within a range: an APG spinbutton with decrease and increase buttons inside
// the field. Typed text is committed on blur and Enter, clamped to min and max; text that is not a
// whole number is rejected, the previous value restored, and the field says so.

const REPEAT_DELAY_MS = 400
const REPEAT_INTERVAL_MS = 60

type NumberStepperProps = Omit<
  React.ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "size" | "min" | "max" | "step" | "type"
> & {
  value: number | null
  onValueChange: (value: number | null) => void
  min?: number
  max?: number
  step?: number
  /** Page Up / Page Down. */
  largeStep?: number
  size?: "sm" | "default"
  /** Shown after the number and read with it ("14 days"). */
  unit?: string
}

function NumberStepper({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  largeStep = 10,
  size = "default",
  unit,
  disabled = false,
  required = false,
  id,
  className,
  onBlur,
  onKeyDown,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  ...props
}: NumberStepperProps) {
  const fallbackId = React.useId()
  const inputId = id ?? fallbackId
  const errorId = React.useId()
  // Text being typed; null while the field simply shows `value`.
  const [draft, setDraft] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  // The latest value, read by the hold-to-repeat timer between renders.
  const latest = React.useRef(value)
  const timers = React.useRef({ delay: 0, repeat: 0 })

  React.useEffect(() => {
    latest.current = value
  }, [value])

  React.useEffect(() => {
    const pending = timers.current
    return () => {
      window.clearTimeout(pending.delay)
      window.clearInterval(pending.repeat)
    }
  }, [])

  const clamp = (n: number) => Math.min(Math.max(n, min ?? -Infinity), max ?? Infinity)

  function emit(next: number | null) {
    setDraft(null)
    setError(null)
    if (next === latest.current) return
    latest.current = next
    onValueChange(next)
  }

  function commitDraft() {
    if (draft === null) return
    const text = draft.trim()
    const kept = latest.current === null ? "" : ` Kept ${latest.current}.`
    if (text === "" && !required) {
      emit(null)
    } else if (/^-?\d+$/.test(text)) {
      emit(clamp(Number(text)))
    } else {
      setDraft(null)
      setError(text === "" ? `Enter a number.${kept}` : `“${text}” isn't a whole number.${kept}`)
    }
  }

  /**
   * Moves by `delta` from the typed text (when it is a number) or the value; false when already at
   * the limit. Repeats pass `fromDraft: false`: their closure still holds the text typed before
   * the first step.
   */
  function stepBy(delta: number, fromDraft = true): boolean {
    const typed = fromDraft && draft !== null && /^-?\d+$/.test(draft.trim()) ? Number(draft.trim()) : null
    const base = typed ?? latest.current
    const next = base === null ? clamp(min ?? 0) : clamp(base + delta)
    const moved = next !== latest.current
    emit(next)
    return moved
  }

  function stopRepeat() {
    window.clearTimeout(timers.current.delay)
    window.clearInterval(timers.current.repeat)
  }

  function startRepeat(delta: number) {
    stopRepeat()
    if (!stepBy(delta)) return
    timers.current.delay = window.setTimeout(() => {
      timers.current.repeat = window.setInterval(() => {
        if (!stepBy(delta, false)) stopRepeat()
      }, REPEAT_INTERVAL_MS)
    }, REPEAT_DELAY_MS)
  }

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event)
    if (event.defaultPrevented) return
    switch (event.key) {
      case "ArrowUp":
        stepBy(step)
        break
      case "ArrowDown":
        stepBy(-step)
        break
      case "PageUp":
        stepBy(largeStep)
        break
      case "PageDown":
        stepBy(-largeStep)
        break
      case "Home":
        if (min === undefined) return
        emit(min)
        break
      case "End":
        if (max === undefined) return
        emit(max)
        break
      case "Enter":
        // With nothing typed, Enter submits the form as usual.
        if (draft === null) return
        commitDraft()
        break
      default:
        return
    }
    event.preventDefault()
  }

  const display = draft ?? (value === null ? "" : String(value))
  const atMin = value !== null && min !== undefined && value <= min
  const atMax = value !== null && max !== undefined && value >= max
  const invalid = error !== null || ariaInvalid === true || ariaInvalid === "true"
  const buttonSize = size === "sm" ? "icon-xs" : "icon-sm"

  function stepButton(direction: -1 | 1) {
    const delta = direction * step
    return (
      <Button
        type="button"
        variant="ghost"
        size={buttonSize}
        data-slot={direction < 0 ? "number-stepper-decrement" : "number-stepper-increment"}
        aria-label={direction < 0 ? "Decrease" : "Increase"}
        aria-controls={inputId}
        tabIndex={-1}
        disabled={disabled || (direction < 0 ? atMin : atMax)}
        // 44px touch target on phones without growing the field.
        className={cn(
          "relative text-muted-foreground after:absolute md:after:hidden",
          size === "sm" ? "after:-inset-2.5" : "after:-inset-2"
        )}
        // Keep focus (and the caret) in the field while the button is held.
        onMouseDown={(event) => event.preventDefault()}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          startRepeat(delta)
        }}
        onPointerUp={stopRepeat}
        onPointerLeave={stopRepeat}
        onPointerCancel={stopRepeat}
        // Activation without a pointer (assistive technology) arrives as a click with no detail.
        onClick={(event) => {
          if (event.detail === 0) stepBy(delta)
        }}
      >
        {direction < 0 ? <MinusIcon /> : <PlusIcon />}
      </Button>
    )
  }

  return (
    <>
      <InputGroup
        data-slot="number-stepper"
        data-size={size}
        className={cn(
          "bg-background has-[[data-slot=input-group-control]:focus-visible]:ring-ring/30 dark:bg-background",
          size === "sm" && "h-8",
          className
        )}
      >
        <InputGroupAddon align="inline-start">{stepButton(-1)}</InputGroupAddon>
        <InputGroupInput
          {...props}
          id={inputId}
          role="spinbutton"
          inputMode="numeric"
          autoComplete="off"
          aria-valuenow={value ?? undefined}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={unit && value !== null ? `${value} ${unit}` : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={[ariaDescribedBy, error ? errorId : null].filter(Boolean).join(" ") || undefined}
          required={required}
          disabled={disabled}
          value={display}
          onChange={(event) => {
            setDraft(event.target.value)
            setError(null)
          }}
          onKeyDown={onInputKeyDown}
          onBlur={(event) => {
            commitDraft()
            onBlur?.(event)
          }}
          className={cn("h-full px-1 tabular", unit ? "text-right" : "text-center")}
        />
        <InputGroupAddon align="inline-end">
          {unit && <InputGroupText aria-hidden>{unit}</InputGroupText>}
          {stepButton(1)}
        </InputGroupAddon>
      </InputGroup>
      {error && (
        <FieldError id={errorId} className="type-footnote">
          {error}
        </FieldError>
      )}
    </>
  )
}

export { NumberStepper }
export type { NumberStepperProps }
