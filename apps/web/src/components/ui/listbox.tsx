"use client"

import * as React from "react"
import { cn } from "cn"
import { CheckIcon } from "lucide-react"

// DESIGN.md listbox: a visible list of options kept on the page, single or multiple selection.
// Hand-built to the ARIA APG listbox pattern (Radix has none; cmdk is filter-first). The list is
// the one tab stop and points at the active option with aria-activedescendant (no roving
// tabindex). Options are read from the DOM in order, so groups and conditional options need no
// registration.

type ListboxContextValue = {
  multiple: boolean
  disabled: boolean
  focused: boolean
  activeId: string | null
  selected: ReadonlySet<string>
  choose: (value: string, optionId: string) => void
}

const ListboxContext = React.createContext<ListboxContextValue | null>(null)

function useListboxContext() {
  const context = React.useContext(ListboxContext)
  if (!context) throw new Error("ListboxOption must be used inside a Listbox")
  return context
}

type ListboxSelectionProps =
  | { selectionMode?: "single"; value: string | null; onValueChange: (value: string) => void }
  | { selectionMode: "multiple"; value: string[]; onValueChange: (value: string[]) => void }

type ListboxProps = Omit<React.ComponentProps<"div">, "defaultValue" | "onChange"> &
  ListboxSelectionProps & {
    disabled?: boolean
  }

const TYPEAHEAD_RESET_MS = 500

function enabledOptions(list: HTMLElement | null): HTMLElement[] {
  return Array.from(list?.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])') ?? [])
}

function optionValue(option: HTMLElement) {
  return option.dataset.value ?? ""
}

function optionText(option: HTMLElement) {
  return (option.dataset.textValue ?? option.textContent ?? "").trim().toLowerCase()
}

function Listbox({
  selectionMode = "single",
  value,
  onValueChange,
  disabled = false,
  className,
  children,
  onKeyDown,
  onFocus,
  onBlur,
  ...props
}: ListboxProps) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [focused, setFocused] = React.useState(false)
  // The option a Shift+Space range starts from: the one most recently selected or toggled.
  const anchorRef = React.useRef<string | null>(null)
  const typeaheadRef = React.useRef({ text: "", timer: 0 })

  const multiple = selectionMode === "multiple"
  const selected = React.useMemo(
    () => new Set(Array.isArray(value) ? value : value != null ? [value] : []),
    [value]
  )

  const commit = (next: string[]) => {
    // `selectionMode` ties `value` and `onValueChange` together in ListboxProps; destructuring
    // loses that link, so restore it here.
    if (multiple) (onValueChange as (value: string[]) => void)(next)
    else if (next.length > 0) (onValueChange as (value: string) => void)(next[0])
  }

  const toggle = (optionValueToToggle: string) => {
    anchorRef.current = optionValueToToggle
    commit(
      selected.has(optionValueToToggle)
        ? [...selected].filter((v) => v !== optionValueToToggle)
        : [...selected, optionValueToToggle]
    )
  }

  const addRange = (options: HTMLElement[], from: number, to: number) => {
    const [start, end] = from <= to ? [from, to] : [to, from]
    const next = new Set(selected)
    for (const option of options.slice(start, end + 1)) next.add(optionValue(option))
    commit([...next])
  }

  /** Make `option` active; in single select the selection follows it. */
  const activate = (option: HTMLElement, { follow = true } = {}) => {
    setActiveId(option.id)
    option.scrollIntoView({ block: "nearest" })
    if (!multiple && follow) {
      anchorRef.current = optionValue(option)
      commit([optionValue(option)])
    }
  }

  const choose = (optionValueChosen: string, optionId: string) => {
    if (disabled) return
    setActiveId(optionId)
    if (multiple) toggle(optionValueChosen)
    else {
      anchorRef.current = optionValueChosen
      commit([optionValueChosen])
    }
  }

  const typeahead = (key: string, options: HTMLElement[], index: number) => {
    const state = typeaheadRef.current
    window.clearTimeout(state.timer)
    state.text += key.toLowerCase()
    state.timer = window.setTimeout(() => {
      state.text = ""
    }, TYPEAHEAD_RESET_MS)
    // Pressing the same letter again cycles through options that start with it.
    const repeated = [...state.text].every((char) => char === state.text[0])
    const search = repeated ? state.text[0] : state.text
    const start = repeated ? index + 1 : Math.max(index, 0)
    const ordered = [...options.slice(start), ...options.slice(0, start)]
    return ordered.find((option) => optionText(option).startsWith(search))
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || disabled) return
    const options = enabledOptions(listRef.current)
    if (options.length === 0) return
    const index = options.findIndex((option) => option.id === activeId)
    const current = index >= 0 ? options[index] : undefined
    const last = options.length - 1
    const modifier = event.ctrlKey || event.metaKey

    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp": {
        event.preventDefault()
        const step = event.key === "ArrowDown" ? 1 : -1
        const next = options[index < 0 ? 0 : Math.min(last, Math.max(0, index + step))]
        if (multiple && event.shiftKey) {
          activate(next)
          toggle(optionValue(next))
        } else activate(next)
        return
      }
      case "Home":
      case "End": {
        event.preventDefault()
        const target = event.key === "Home" ? 0 : last
        if (multiple && modifier && event.shiftKey) addRange(options, index < 0 ? target : index, target)
        activate(options[target])
        return
      }
      case " ": {
        event.preventDefault()
        if (!current) return
        if (!multiple) {
          commit([optionValue(current)])
          return
        }
        const anchorIndex = options.findIndex((option) => optionValue(option) === anchorRef.current)
        if (event.shiftKey && anchorIndex >= 0) addRange(options, anchorIndex, index)
        else toggle(optionValue(current))
        return
      }
      default: {
        if (multiple && modifier && event.key.toLowerCase() === "a") {
          event.preventDefault()
          commit(options.map(optionValue))
          return
        }
        if (event.key.length !== 1 || modifier || event.altKey) return
        const match = typeahead(event.key, options, index)
        if (match) {
          event.preventDefault()
          activate(match)
        }
      }
    }
  }

  return (
    <ListboxContext.Provider value={{ multiple, disabled, focused, activeId, selected, choose }}>
      <div
        ref={listRef}
        role="listbox"
        tabIndex={disabled ? -1 : 0}
        aria-multiselectable={multiple || undefined}
        aria-disabled={disabled || undefined}
        aria-activedescendant={focused && activeId ? activeId : undefined}
        data-slot="listbox"
        onKeyDown={handleKeyDown}
        onFocus={(event) => {
          onFocus?.(event)
          setFocused(true)
          // Tab lands on the active option if it still exists, else the first selected, else the first.
          const options = enabledOptions(listRef.current)
          if (options.some((option) => option.id === activeId)) return
          const first = options.find((option) => selected.has(optionValue(option))) ?? options[0]
          if (first) setActiveId(first.id)
        }}
        onBlur={(event) => {
          onBlur?.(event)
          setFocused(false)
        }}
        className={cn(
          "max-h-72 overflow-y-auto rounded-xl border bg-card p-1 outline-none scrollbar-thin focus-visible:ring-3 focus-visible:ring-ring/30 aria-disabled:opacity-50",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </ListboxContext.Provider>
  )
}

function ListboxGroup({
  label,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "role"> & { label: React.ReactNode }) {
  const labelId = React.useId()
  return (
    <div role="group" aria-labelledby={labelId} data-slot="listbox-group" className={className} {...props}>
      <div id={labelId} className="px-2 pt-2 pb-1 type-caption-2 text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  )
}

function ListboxOption({
  value,
  disabled = false,
  textValue,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "role" | "id"> & {
  value: string
  disabled?: boolean
  /** Text matched by typeahead when the option's content is not plain text. */
  textValue?: string
}) {
  const context = useListboxContext()
  const id = React.useId()
  const selected = context.selected.has(value)
  const active = context.focused && context.activeId === id
  const inactive = disabled || context.disabled

  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      aria-disabled={inactive || undefined}
      data-slot="listbox-option"
      data-value={value}
      data-text-value={textValue}
      data-active={active || undefined}
      data-selected={selected || undefined}
      onClick={() => {
        if (!inactive) context.choose(value, id)
      }}
      className={cn(
        "flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 py-1 type-subhead select-none hover:bg-accent data-active:bg-accent aria-disabled:pointer-events-none aria-disabled:opacity-50 max-md:min-h-11",
        selected && !context.multiple && "font-semibold text-foreground",
        className
      )}
      {...props}
    >
      {context.multiple && (
        <span
          aria-hidden
          className={cn(
            "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input",
            selected && "border-primary bg-primary text-primary-foreground"
          )}
        >
          {selected && <CheckIcon className="size-3.5" />}
        </span>
      )}
      <span className="min-w-0 flex-1">{children}</span>
      {!context.multiple && selected && <CheckIcon aria-hidden className="size-4 shrink-0" />}
    </div>
  )
}

function ListboxEmpty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="listbox-empty"
      className={cn("px-2 py-6 text-center type-subhead text-muted-foreground", className)}
      {...props}
    />
  )
}

export { Listbox, ListboxGroup, ListboxOption, ListboxEmpty }
