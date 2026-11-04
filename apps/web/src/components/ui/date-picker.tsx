"use client"

import * as React from "react"
import { cn } from "cn"
import { CalendarIcon } from "lucide-react"
import type { DayButtonProps, Matcher, MonthCaptionProps } from "react-day-picker"

import { Button } from "@/components/ui/button"
import { Calendar, CalendarDayButton } from "@/components/ui/calendar"
import { DateInput, parseIsoDate, type DateInputProps } from "@/components/ui/date-input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { useMediaQuery } from "@/hooks/use-mobile"
import { todayIso } from "@/lib/format"

// A DateInput with a calendar button. The calendar opens in a modal popover grown from the button
// (a bottom sheet with 44px days on phones). Values stay `YYYY-MM-DD` strings; they become local
// Dates only at the calendar's edge, so no time zone can move a day.

function toIsoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0")
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Local midnight on a `YYYY-MM-DD` day, or undefined when the string is not a real date. */
function toLocalDate(value: string): Date | undefined {
  const parts = parseIsoDate(value)
  if (!parts) return undefined
  const date = new Date(2000, 0, 1)
  // setFullYear, not the constructor, which reads years below 100 as 19xx.
  date.setFullYear(Number(parts.year), Number(parts.month) - 1, Number(parts.day))
  return toIsoDate(date) === value ? date : undefined
}

function outOfRange(min: string | undefined, max: string | undefined): Matcher[] {
  const matchers: Matcher[] = []
  const before = min ? toLocalDate(min) : undefined
  const after = max ? toLocalDate(max) : undefined
  if (before) matchers.push({ before })
  if (after) matchers.push({ after })
  return matchers
}

const longDate = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })

// The dialog is labelled by the first month's caption, which the calendar already announces
// politely when the month changes.
const CaptionIdContext = React.createContext<string | undefined>(undefined)

function LabelledMonthCaption({ displayIndex, className, style, children }: MonthCaptionProps) {
  const id = React.useContext(CaptionIdContext)
  return (
    <div id={displayIndex === 0 ? id : undefined} className={className} style={style}>
      {children}
    </div>
  )
}

function DayButtonMarkingToday(props: DayButtonProps) {
  return <CalendarDayButton {...props} aria-current={props.modifiers.today ? "date" : undefined} />
}

const CALENDAR_COMPONENTS = { MonthCaption: LabelledMonthCaption, DayButton: DayButtonMarkingToday }

function calendarClassName(phone: boolean) {
  return cn("bg-transparent p-0 type-subhead tabular", phone && "mx-auto [--cell-size:--spacing(11)]")
}

function CalendarSurface({
  label,
  title,
  size,
  disabled,
  children,
}: {
  label: string
  title: string
  size: "sm" | "default"
  disabled: boolean
  children: (surface: { close: () => void; phone: boolean }) => React.ReactNode
}) {
  const phone = useMediaQuery("(max-width: 767px)")
  const [open, setOpen] = React.useState(false)
  // Surfaces summoned from the keyboard appear and leave without animating (DESIGN.md § Motion).
  const [instant, setInstant] = React.useState(false)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const captionId = React.useId()

  // Focus lands on the selected day, else today (the day the grid makes tabbable).
  function focusDay(event: Event) {
    const day = contentRef.current?.querySelector<HTMLButtonElement>('[role="grid"] button[tabindex="0"]')
    if (!day) return
    event.preventDefault()
    day.focus()
  }

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size={size === "sm" ? "icon-xs" : "icon-sm"}
      aria-label={label}
      disabled={disabled}
      className="-mr-1 ml-auto text-muted-foreground"
      onPointerDown={() => setInstant(false)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") setInstant(true)
      }}
    >
      <CalendarIcon />
    </Button>
  )
  const body = (
    <CaptionIdContext.Provider value={captionId}>{children({ close: () => setOpen(false), phone })}</CaptionIdContext.Provider>
  )
  const stillness = instant && "data-open:animate-none data-closed:animate-none"

  if (phone) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          ref={contentRef}
          side="bottom"
          aria-modal="true"
          onOpenAutoFocus={focusDay}
          className={cn("rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))]", stillness)}
        >
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-2.5 px-4">{body}</div>
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="end"
        aria-modal="true"
        aria-labelledby={captionId}
        onOpenAutoFocus={focusDay}
        className={cn("w-auto p-3 ease-out", stillness)}
      >
        {body}
      </PopoverContent>
    </Popover>
  )
}

type DatePickerProps = Omit<DateInputProps, "children">

function DatePicker({ value, onValueChange, min, max, size = "default", disabled = false, required = false, ...props }: DatePickerProps) {
  const selected = toLocalDate(value)
  const today = todayIso()
  const todayAllowed = (!min || today >= min) && (!max || today <= max)

  return (
    <DateInput
      data-slot="date-picker"
      {...props}
      value={value}
      onValueChange={onValueChange}
      min={min}
      max={max}
      size={size}
      disabled={disabled}
      required={required}
    >
      <CalendarSurface label={selected ? `Change date, ${longDate.format(selected)}` : "Choose date"} title="Choose date" size={size} disabled={disabled}>
        {({ close, phone }) => {
          const choose = (next: string) => {
            onValueChange?.(next)
            close()
          }
          return (
            <>
              <Calendar
                mode="single"
                selected={selected}
                defaultMonth={selected}
                // Pressing the selected day again keeps it rather than clearing the date.
                onSelect={(date) => choose(date ? toIsoDate(date) : value)}
                disabled={outOfRange(min, max)}
                components={CALENDAR_COMPONENTS}
                className={calendarClassName(phone)}
              />
              <div className="flex items-center justify-between gap-2 border-t pt-2">
                <Button type="button" variant="ghost" size="sm" disabled={!todayAllowed} onClick={() => choose(today)}>
                  Today
                </Button>
                {!required && value && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => choose("")}>
                    Clear
                  </Button>
                )}
              </div>
            </>
          )
        }}
      </CalendarSurface>
    </DateInput>
  )
}

type DateRangeValue = { from: string; to: string }

type DateRangePickerProps = Omit<React.ComponentProps<"div">, "id" | "onChange" | "defaultValue"> & {
  value: DateRangeValue
  onValueChange: (value: DateRangeValue) => void
  min?: string
  max?: string
  /** Months side by side on wider screens; phones always show one. */
  numberOfMonths?: number
  presets?: Array<{ label: string; value: DateRangeValue }>
  size?: "sm" | "default"
  disabled?: boolean
  /** Goes on the start date's year segment, so `<label htmlFor>` focuses the field. */
  id?: string
}

function RangeCalendar({
  from,
  to,
  min,
  max,
  numberOfMonths,
  presets,
  phone,
  onPick,
}: {
  from: Date | undefined
  to: Date | undefined
  min: string | undefined
  max: string | undefined
  numberOfMonths: number
  presets: DateRangePickerProps["presets"]
  phone: boolean
  onPick: (value: DateRangeValue) => void
}) {
  // The first press sets the start and the second the end, in either order; then the picker closes.
  const [start, setStart] = React.useState<Date | null>(null)
  return (
    <div className="flex flex-col gap-3 md:flex-row">
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-1 md:w-36 md:flex-col md:border-r md:pr-3">
          {presets.map((preset) => (
            <Button key={preset.label} type="button" variant="ghost" size="sm" className="justify-start font-normal" onClick={() => onPick(preset.value)}>
              {preset.label}
            </Button>
          ))}
        </div>
      )}
      <Calendar
        mode="range"
        numberOfMonths={numberOfMonths}
        selected={start ? { from: start, to: undefined } : from ? { from, to } : undefined}
        defaultMonth={from}
        onSelect={(_, day) => {
          if (!start) {
            setStart(day)
            return
          }
          const [first, last] = start <= day ? [start, day] : [day, start]
          onPick({ from: toIsoDate(first), to: toIsoDate(last) })
        }}
        disabled={outOfRange(min, max)}
        components={CALENDAR_COMPONENTS}
        className={calendarClassName(phone)}
      />
    </div>
  )
}

function DateRangePicker({
  value,
  onValueChange,
  min,
  max,
  numberOfMonths = 2,
  presets,
  size = "default",
  disabled = false,
  id,
  className,
  ...props
}: DateRangePickerProps) {
  const from = toLocalDate(value.from)
  const to = toLocalDate(value.to)
  const label = from && to ? `Change dates, ${longDate.format(from)} to ${longDate.format(to)}` : "Choose dates"
  const column = "flex min-w-0 flex-1 flex-col gap-1.5"

  return (
    <div role="group" data-slot="date-range-picker" {...props} className={cn("flex w-full min-w-0 items-start gap-2", className)}>
      <div className={column}>
        <DateInput
          id={id}
          aria-label="Start date"
          value={value.from}
          onValueChange={(next) => onValueChange({ ...value, from: next })}
          min={min}
          max={value.to || max}
          size={size}
          disabled={disabled}
        />
      </div>
      <span aria-hidden className={cn("flex items-center text-muted-foreground", size === "sm" ? "h-8" : "h-9")}>
        –
      </span>
      <div className={column}>
        <DateInput
          aria-label="End date"
          value={value.to}
          onValueChange={(next) => onValueChange({ ...value, to: next })}
          min={value.from || min}
          max={max}
          size={size}
          disabled={disabled}
        >
          <CalendarSurface label={label} title="Choose dates" size={size} disabled={disabled}>
            {({ close, phone }) => {
              const pick = (next: DateRangeValue) => {
                onValueChange(next)
                close()
              }
              return (
                <>
                  <RangeCalendar
                    from={from}
                    to={to}
                    min={min}
                    max={max}
                    numberOfMonths={phone ? 1 : numberOfMonths}
                    presets={presets}
                    phone={phone}
                    onPick={pick}
                  />
                  {(value.from || value.to) && (
                    <div className="flex justify-end border-t pt-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => pick({ from: "", to: "" })}>
                        Clear
                      </Button>
                    </div>
                  )}
                </>
              )
            }}
          </CalendarSurface>
        </DateInput>
      </div>
    </div>
  )
}

export { DatePicker, DateRangePicker }
export type { DatePickerProps, DateRangePickerProps, DateRangeValue }
