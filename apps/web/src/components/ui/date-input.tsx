"use client"

import * as React from "react"
import { cn } from "cn"

import { FieldError } from "@/components/ui/field"
import { todayIso } from "@/lib/format"

// A Beancount date (YYYY-MM-DD) typed into year, month and day segments, each an APG spinbutton.
// The value is always a string, never a Date, so no time zone can shift it. `onValueChange`
// fires only with a complete, real, in-range date or "" — partial input stays inside the field,
// and anything that can't become a date shows `aria-invalid` and a message under the field.

type SegmentKey = "year" | "month" | "day"
type Segments = Record<SegmentKey, string>

const SEGMENTS: Array<{ key: SegmentKey; label: string; placeholder: string; length: number; largeStep: number }> = [
  { key: "year", label: "Year", placeholder: "YYYY", length: 4, largeStep: 10 },
  { key: "month", label: "Month", placeholder: "MM", length: 2, largeStep: 3 },
  { key: "day", label: "Day", placeholder: "DD", length: 2, largeStep: 7 },
]
const SEGMENT_ORDER = SEGMENTS.map((segment) => segment.key)
const EMPTY: Segments = { year: "", month: "", day: "" }
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

function parseIsoDate(value: string): Segments | null {
  const match = ISO_DATE.exec(value.trim())
  return match ? { year: match[1]!, month: match[2]!, day: match[3]! } : null
}

/** Days in a month; a leap year stands in while the year is unknown so 29 February stays typeable. */
function daysInMonth(year: string, month: string): number {
  const m = Number(month)
  if (!month || m < 1 || m > 12) return 31
  return new Date(year.length === 4 ? Number(year) : 2000, m, 0).getDate()
}

function segmentRange(key: SegmentKey, segments: Segments): [number, number] {
  if (key === "year") return [1, 9999]
  if (key === "month") return [1, 12]
  return [1, daysInMonth(segments.year, segments.month)]
}

function pad(key: SegmentKey, digits: string): string {
  return digits.padStart(key === "year" ? 4 : 2, "0")
}

// Fixed English locale: the interface copy is English, and the server and browser must render the
// same accessible text.
const monthNames = new Intl.DateTimeFormat("en-GB", { month: "long" })

function valueText(key: SegmentKey, digits: string): string {
  if (!digits) return "Empty"
  const n = Number(digits)
  return key === "month" && n >= 1 && n <= 12 ? monthNames.format(new Date(2000, n - 1, 1)) : String(n)
}

/** The value the segments spell, or why they don't spell one yet. */
function evaluate(segments: Segments, min: string | undefined, max: string | undefined): { value: string; error: string | null; complete: boolean } {
  const complete = segments.year.length === 4 && Number(segments.month) > 0 && Number(segments.day) > 0
  if (!complete) return { value: "", error: null, complete }
  const iso = `${segments.year}-${pad("month", segments.month)}-${pad("day", segments.day)}`
  const [, maxDay] = segmentRange("day", segments)
  if (Number(segments.year) < 1 || Number(segments.month) > 12 || Number(segments.day) > maxDay) {
    return { value: "", error: `${iso} isn't a real date.`, complete }
  }
  if (min && iso < min) return { value: "", error: `Pick a date on or after ${min}.`, complete }
  if (max && iso > max) return { value: "", error: `Pick a date on or before ${max}.`, complete }
  return { value: iso, error: null, complete }
}

type DateInputProps = Omit<React.ComponentProps<"div">, "id" | "onChange" | "defaultValue"> & {
  /** `YYYY-MM-DD`, or "" for no date. */
  value: string
  onValueChange?: (value: string) => void
  min?: string
  max?: string
  size?: "sm" | "default"
  disabled?: boolean
  required?: boolean
  /** Submits the value with a form through a hidden input. */
  name?: string
  /** Goes on the year segment, so `<label htmlFor>` focuses the field. */
  id?: string
}

function DateInput({
  value,
  onValueChange,
  min,
  max,
  size = "default",
  disabled = false,
  required = false,
  name,
  id,
  className,
  children,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  ...props
}: DateInputProps) {
  const [segments, setSegments] = React.useState<Segments>(() => parseIsoDate(value) ?? EMPTY)
  // The last value this field received or emitted. A different `value` prop means the parent
  // changed it (for example from the calendar), so the segments follow; our own echo does not.
  const [syncedValue, setSyncedValue] = React.useState(value)
  // The segment whose digits are still being typed; typing elsewhere starts the segment afresh.
  const [typing, setTyping] = React.useState<SegmentKey | null>(null)
  const [left, setLeft] = React.useState(false)
  const [pasteError, setPasteError] = React.useState<string | null>(null)
  const inputs = React.useRef<Partial<Record<SegmentKey, HTMLInputElement | null>>>({})
  const messageId = React.useId()

  if (value !== syncedValue) {
    setSyncedValue(value)
    setSegments(parseIsoDate(value) ?? EMPTY)
    setTyping(null)
    setPasteError(null)
  }

  const evaluation = evaluate(segments, min, max)
  const filled = SEGMENT_ORDER.some((key) => segments[key] !== "")
  const message =
    pasteError ??
    (syncedValue !== "" && !parseIsoDate(syncedValue) ? `“${syncedValue}” isn't a YYYY-MM-DD date.` : null) ??
    evaluation.error ??
    (left && filled && !evaluation.complete ? "Enter the full date as YYYY-MM-DD." : null) ??
    (left && required && !filled ? "Enter a date." : null)
  const invalid = message !== null || ariaInvalid === true || ariaInvalid === "true"

  function commit(next: Segments) {
    setSegments(next)
    setLeft(false)
    setPasteError(null)
    const nextValue = evaluate(next, min, max).value
    if (nextValue !== syncedValue) {
      setSyncedValue(nextValue)
      onValueChange?.(nextValue)
    }
  }

  function focusSegment(key: SegmentKey | undefined) {
    if (key) inputs.current[key]?.focus()
  }

  function neighbour(key: SegmentKey, offset: -1 | 1): SegmentKey | undefined {
    return SEGMENT_ORDER[SEGMENT_ORDER.indexOf(key) + offset]
  }

  function typeDigit(key: SegmentKey, digit: string) {
    const { length } = SEGMENTS.find((segment) => segment.key === key)!
    const [, high] = segmentRange(key, segments)
    let digits = typing === key ? segments[key] + digit : digit
    if (digits.length > length || Number(digits) > high) digits = digit
    // Move on once the segment is full or no further digit could fit (4 in a month can only be April).
    const full = digits.length >= length || Number(digits) * 10 > high
    commit({ ...segments, [key]: digits })
    setTyping(full ? null : key)
    if (full) focusSegment(neighbour(key, 1))
  }

  function setSegment(key: SegmentKey, n: number) {
    const next = { ...segments, [key]: pad(key, String(n)) }
    // Stepping the month or year keeps the day inside the new month instead of making it invalid.
    if (key !== "day" && next.day) {
      const maxDay = daysInMonth(next.year, next.month)
      if (Number(next.day) > maxDay) next.day = pad("day", String(maxDay))
    }
    commit(next)
    setTyping(null)
  }

  function step(key: SegmentKey, delta: number) {
    const [low, high] = segmentRange(key, segments)
    if (segments[key] === "") {
      const today = parseIsoDate(todayIso())!
      setSegment(key, Math.min(Math.max(Number(today[key]), low), high))
      return
    }
    const span = high - low + 1
    const current = Math.min(Math.max(Number(segments[key]), low), high)
    setSegment(key, ((((current - low + delta) % span) + span) % span) + low)
  }

  function clearOrRetreat(key: SegmentKey, retreat: boolean) {
    if (segments[key] !== "") {
      commit({ ...segments, [key]: "" })
      setTyping(null)
    } else if (retreat) {
      focusSegment(neighbour(key, -1))
    }
  }

  function onSegmentKeyDown(key: SegmentKey, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const { largeStep } = SEGMENTS.find((segment) => segment.key === key)!
    const [low, high] = segmentRange(key, segments)
    switch (event.key) {
      case "ArrowUp":
        step(key, 1)
        break
      case "ArrowDown":
        step(key, -1)
        break
      case "PageUp":
        step(key, largeStep)
        break
      case "PageDown":
        step(key, -largeStep)
        break
      case "Home":
        setSegment(key, low)
        break
      case "End":
        setSegment(key, high)
        break
      case "ArrowLeft":
        focusSegment(neighbour(key, -1))
        break
      case "ArrowRight":
      case "-":
      case "/":
      case ".":
        focusSegment(neighbour(key, 1))
        break
      case "Backspace":
        clearOrRetreat(key, true)
        break
      case "Delete":
        clearOrRetreat(key, false)
        break
      default:
        if (/^\d$/.test(event.key)) typeDigit(key, event.key)
        // Any other printable key is not part of a date; Tab, Enter and Escape pass through.
        else if (event.key.length !== 1) return
    }
    event.preventDefault()
  }

  // Keys arrive as "Unidentified" from some phone keyboards, so the text they insert is read here.
  function onSegmentInput(key: SegmentKey, event: React.ChangeEvent<HTMLInputElement>) {
    const native = event.nativeEvent as InputEvent
    if (native.inputType?.startsWith("delete")) {
      clearOrRetreat(key, native.inputType === "deleteContentBackward")
      return
    }
    const digit = native.data?.match(/\d/g)?.at(-1)
    if (digit) typeDigit(key, digit)
    else if (native.data && /[-/.]/.test(native.data)) focusSegment(neighbour(key, 1))
  }

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    if (disabled) return
    event.preventDefault()
    const text = event.clipboardData.getData("text")
    const pasted = parseIsoDate(text)
    if (!pasted) {
      setPasteError(`Couldn't read “${text.trim().slice(0, 40)}” as a YYYY-MM-DD date.`)
      return
    }
    commit(pasted)
    setTyping(null)
  }

  return (
    <>
      <div
        role="group"
        data-slot="date-input"
        {...props}
        data-size={size}
        data-disabled={disabled || undefined}
        aria-describedby={[ariaDescribedBy, message ? messageId : null].filter(Boolean).join(" ") || undefined}
        className={cn(
          "flex w-full min-w-0 items-center gap-0.5 rounded-md border border-input bg-background font-mono text-base tabular outline-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 data-disabled:cursor-not-allowed data-disabled:opacity-50 md:text-sm",
          size === "sm" ? "h-8 px-2" : "h-9 px-2.5",
          invalid && "border-destructive ring-3 ring-destructive/20 focus-within:border-destructive focus-within:ring-destructive/20",
          className
        )}
        onPaste={onPaste}
        onMouseDown={(event) => {
          // A press on the field's padding lands in the first empty segment, as on a text field.
          if (event.target !== event.currentTarget || disabled) return
          event.preventDefault()
          focusSegment(SEGMENT_ORDER.find((key) => segments[key] === "") ?? "year")
        }}
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return
          setLeft(true)
          setTyping(null)
        }}
      >
        {SEGMENTS.map((segment, index) => {
          const digits = segments[segment.key]
          const [low, high] = segmentRange(segment.key, segments)
          return (
            <React.Fragment key={segment.key}>
              {index > 0 && (
                <span aria-hidden className="text-muted-foreground select-none">
                  -
                </span>
              )}
              <input
                ref={(element) => {
                  inputs.current[segment.key] = element
                }}
                id={index === 0 ? id : undefined}
                data-slot="date-input-segment"
                data-segment={segment.key}
                type="text"
                role="spinbutton"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                aria-label={segment.label}
                aria-valuemin={low}
                aria-valuemax={high}
                aria-valuenow={digits ? Number(digits) : undefined}
                aria-valuetext={valueText(segment.key, digits)}
                aria-invalid={invalid || undefined}
                aria-required={required || undefined}
                disabled={disabled}
                placeholder={segment.placeholder}
                // The year is never padded on display: "26" must read as unfinished, because the
                // field only accepts a four-digit year (padding it to "0026" would look complete).
                value={typing === segment.key || !digits || segment.key === "year" ? digits : pad(segment.key, digits)}
                onChange={(event) => onSegmentInput(segment.key, event)}
                onKeyDown={(event) => onSegmentKeyDown(segment.key, event)}
                onFocus={() => setTyping(null)}
                className={cn(
                  "box-content h-[1.5em] rounded-sm bg-transparent px-0.5 text-center caret-transparent outline-none placeholder:text-muted-foreground focus:bg-accent focus:text-accent-foreground disabled:cursor-not-allowed",
                  segment.key === "year" ? "w-[4ch]" : "w-[2ch]"
                )}
              />
            </React.Fragment>
          )
        })}
        {children}
      </div>
      {name && <input type="hidden" name={name} value={evaluation.value} />}
      {message && (
        <FieldError id={messageId} className="type-footnote">
          {message}
        </FieldError>
      )}
    </>
  )
}

export { DateInput, parseIsoDate }
export type { DateInputProps }
