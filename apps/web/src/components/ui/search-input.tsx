"use client"

import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "cn"
import { CircleXIcon, SearchIcon } from "lucide-react"

import { InputGroupButton } from "@/components/ui/input-group"
import { Kbd } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"

// DESIGN.md search field: a grey `fill` field with no border, like the top-bar search button, for
// filtering the list on the current page as you type. App-wide search is the ⌘K palette, not this.
const searchInputVariants = cva(
  "group/search-input relative flex w-full min-w-0 items-center gap-2 rounded-md bg-fill pr-1 pl-3 text-muted-foreground hover:bg-fill-secondary has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/30 has-[input:disabled]:pointer-events-none has-[input:disabled]:opacity-50",
  {
    variants: {
      size: {
        sm: "h-7",
        default: "h-8",
        lg: "h-9",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

/** True when a key press is meant for the focused field, not for a page shortcut. */
function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  )
}

function SearchInput({
  value,
  onValueChange,
  label,
  size = "default",
  loading = false,
  shortcut,
  landmark = true,
  resultLabel,
  className,
  onKeyDown,
  ref,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "value" | "onChange" | "size"> & {
  value: string
  onValueChange: (value: string) => void
  /** Accessible name of the field, e.g. "Search entries". */
  label: string
  size?: "sm" | "default" | "lg"
  /** Results are loading: a spinner takes the clear button's place. */
  loading?: boolean
  /** A single key (e.g. "/") that focuses the field from anywhere on the page; shown as a Kbd hint. */
  shortcut?: string
  /** Wrap the field in a <search> landmark (default). Turn off inside popovers and sheets. */
  landmark?: boolean
  /** Result count to announce politely once typing settles, e.g. "42 entries". */
  resultLabel?: string
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const setInputRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) ref.current = node
    },
    [ref]
  )

  React.useEffect(() => {
    if (!shortcut) return
    const onShortcut = (event: KeyboardEvent) => {
      if (event.key !== shortcut || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return
      event.preventDefault()
      inputRef.current?.focus()
    }
    document.addEventListener("keydown", onShortcut)
    return () => document.removeEventListener("keydown", onShortcut)
  }, [shortcut])

  // Announce counts only after typing pauses, never on every keystroke, and only while searching.
  const pendingAnnouncement = value && resultLabel ? resultLabel : ""
  const [announcement, setAnnouncement] = React.useState("")
  React.useEffect(() => {
    const timer = setTimeout(() => setAnnouncement(pendingAnnouncement), 700)
    return () => clearTimeout(timer)
  }, [pendingAnnouncement])

  const clear = () => {
    onValueChange("")
    inputRef.current?.focus()
  }

  const Root = landmark ? "search" : "div"

  return (
    // role="search" repeats <search>'s implicit role for engines that predate the element.
    <Root role={landmark ? "search" : undefined} data-slot="search-input" data-size={size} className={cn(searchInputVariants({ size }), className)}>
      <SearchIcon aria-hidden className="pointer-events-none size-4 shrink-0" />
      <input
        ref={setInputRef}
        type="search"
        aria-label={label}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          // Escape clears first; on an empty field it bubbles so a surrounding popover or sheet closes.
          if (event.key === "Escape" && value && !event.defaultPrevented) {
            event.preventDefault()
            event.stopPropagation()
            onValueChange("")
          }
        }}
        data-slot="search-input-control"
        className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed md:text-sm [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
        {...props}
      />
      {loading ? (
        <span className="flex size-6 shrink-0 items-center justify-center">
          <Spinner className="size-3.5" />
        </span>
      ) : value ? (
        <InputGroupButton
          data-slot="search-input-clear"
          size="icon-xs"
          aria-label="Clear search"
          tabIndex={-1}
          className="text-muted-foreground"
          onClick={clear}
        >
          <CircleXIcon />
        </InputGroupButton>
      ) : shortcut ? (
        <Kbd className="mr-1 max-md:hidden">{shortcut}</Kbd>
      ) : null}
      <span role="status" className="sr-only">
        {announcement}
      </span>
    </Root>
  )
}

export { SearchInput }
