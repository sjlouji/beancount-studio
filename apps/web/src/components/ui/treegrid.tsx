"use client"

import * as React from "react"
import { cn } from "cn"
import { Slot } from "radix-ui"
import { ChevronRightIcon } from "lucide-react"

// The APG treegrid: a table whose rows form an expandable hierarchy, with one tab stop. Rows
// are focusable and own the tree keys (Right expands or enters the row's cells, Left collapses
// or goes to the parent, Up/Down/Home/End/PageUp/PageDown move between visible rows, Enter
// follows the row's link); cells take Left/Right/Up/Down/Home/End. Tab from the focused row
// walks that row's links and buttons, then leaves the grid.
//
// Callers render their own rows (so tables keep their markup) and own their expanded state:
// each parent row gets `expanded` and `onExpandedChange`. Focus is moved with the DOM, as the
// APG reference does, because rows mount and unmount as branches open and close.

const ROW = "[data-slot=treegrid-row]"
const CELL = "[data-slot=treegrid-cell]"
const WIDGET = "a[href], button, input, select, textarea"
const PAGE = 10

function rowsOf(grid: Element) {
  return Array.from(grid.querySelectorAll<HTMLElement>(ROW))
}

function cellsOf(row: Element) {
  return Array.from(row.querySelectorAll<HTMLElement>(`:scope > ${CELL}`))
}

function levelOf(row: Element) {
  return Number(row.getAttribute("aria-level")) || 0
}

/** One row is the tab stop (the last focused, else the first); widgets are tabbable only in it. */
function syncTabStops(grid: HTMLElement, active: HTMLElement | null) {
  const rows = rowsOf(grid)
  const current = active && rows.includes(active) ? active : rows[0]
  for (const row of rows) {
    const isCurrent = row === current
    row.tabIndex = isCurrent ? 0 : -1
    for (const widget of row.querySelectorAll<HTMLElement>(WIDGET)) {
      widget.tabIndex =
        isCurrent && widget.dataset.slot !== "treegrid-toggle" ? 0 : -1
    }
  }
}

/** The row a vertical key lands on, or undefined at the ends. */
function rowFor(row: HTMLElement, key: string): HTMLElement | undefined {
  const grid = row.closest("[data-slot=treegrid]")
  if (!grid) return undefined
  const rows = rowsOf(grid)
  const index = rows.indexOf(row)
  switch (key) {
    case "ArrowDown":
      return rows[index + 1]
    case "ArrowUp":
      return rows[index - 1]
    case "PageDown":
      return rows[Math.min(index + PAGE, rows.length - 1)]
    case "PageUp":
      return rows[Math.max(index - PAGE, 0)]
    case "Home":
      return rows[0]
    case "End":
      return rows[rows.length - 1]
    default:
      return undefined
  }
}

function parentOf(row: HTMLElement): HTMLElement | undefined {
  const level = levelOf(row)
  const grid = row.closest("[data-slot=treegrid]")
  if (!grid || level <= 1) return undefined
  const rows = rowsOf(grid)
  for (let i = rows.indexOf(row) - 1; i >= 0; i -= 1) {
    const candidate = levelOf(rows[i])
    if (candidate > 0 && candidate < level) return rows[i]
  }
  return undefined
}

function blockedByModifiers(event: React.KeyboardEvent) {
  if (event.altKey || event.metaKey || event.shiftKey) return true
  // Ctrl only combines with Home/End (first/last row).
  return event.ctrlKey && event.key !== "Home" && event.key !== "End"
}

const VERTICAL_KEYS = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp"])

function Treegrid({
  className,
  asChild = false,
  ...props
}: Omit<React.ComponentProps<"table">, "ref" | "onFocus"> & {
  asChild?: boolean
}) {
  const gridRef = React.useRef<HTMLElement | null>(null)
  const activeRow = React.useRef<HTMLElement | null>(null)
  const setGrid = React.useCallback((node: HTMLElement | null) => {
    gridRef.current = node
  }, [])

  // Rows mount and unmount as branches open and close, so the tab stop is re-applied after
  // every render; a removed active row hands the tab stop back to the first row.
  React.useLayoutEffect(() => {
    if (gridRef.current) syncTabStops(gridRef.current, activeRow.current)
  })

  const Comp = asChild ? Slot.Root : "table"
  return (
    <Comp
      ref={setGrid}
      role="treegrid"
      data-slot="treegrid"
      className={cn(!asChild && "w-full text-sm", className)}
      onFocus={(event: React.FocusEvent<HTMLElement>) => {
        const row = (event.target as HTMLElement).closest<HTMLElement>(ROW)
        if (!row || row === activeRow.current || !gridRef.current) return
        activeRow.current = row
        syncTabStops(gridRef.current, row)
      }}
      {...props}
    />
  )
}

function TreegridRow({
  className,
  asChild = false,
  level,
  posinset,
  setsize,
  expanded,
  onExpandedChange,
  ...props
}: Omit<React.ComponentProps<"tr">, "onKeyDown"> & {
  asChild?: boolean
  /** 1-based depth; omit for rows outside the tree (totals). */
  level?: number
  posinset?: number
  setsize?: number
  /** Set on parent rows only; leaves leave it undefined. */
  expanded?: boolean
  /** Omit to make the row's open state fixed (Left then goes to the parent). */
  onExpandedChange?: (expanded: boolean) => void
}) {
  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || blockedByModifiers(event)) return
    const row = event.currentTarget
    switch (event.key) {
      case "ArrowRight":
        if (expanded === false && onExpandedChange) onExpandedChange(true)
        else cellsOf(row)[0]?.focus()
        break
      case "ArrowLeft":
        if (expanded === true && onExpandedChange) onExpandedChange(false)
        else parentOf(row)?.focus()
        break
      case "Enter":
        row.querySelector<HTMLElement>("a[href]")?.click()
        break
      case "ArrowDown":
      case "ArrowUp":
      case "PageDown":
      case "PageUp":
      case "Home":
      case "End":
        rowFor(row, event.key)?.focus()
        break
      default:
        return
    }
    event.preventDefault()
  }

  const Comp = asChild ? Slot.Root : "tr"
  return (
    <Comp
      role="row"
      data-slot="treegrid-row"
      aria-level={level}
      aria-posinset={posinset}
      aria-setsize={setsize}
      aria-expanded={expanded}
      // Rows show focus with an inset outline: box-shadow rings don't paint on <tr> everywhere.
      className={cn(
        "outline-none focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-solid focus-visible:outline-ring/40",
        className
      )}
      onKeyDown={onKeyDown}
      {...props}
    />
  )
}

function TreegridCell({
  className,
  asChild = false,
  rowHeader = false,
  ...props
}: Omit<React.ComponentProps<"td">, "onKeyDown"> & {
  asChild?: boolean
  /** The cell that names the row (the account): a row header. */
  rowHeader?: boolean
}) {
  function onKeyDown(event: React.KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || blockedByModifiers(event)) return
    const cell = event.currentTarget
    const row = cell.parentElement
    if (!row) return
    const cells = cellsOf(row)
    const column = cells.indexOf(cell)
    const sameColumn = (target: HTMLElement | undefined) => {
      if (!target) return
      const targetCells = cellsOf(target)
      targetCells[Math.min(column, targetCells.length - 1)]?.focus()
    }
    switch (event.key) {
      case "ArrowRight":
        cells[column + 1]?.focus()
        break
      case "ArrowLeft":
        if (column > 0) cells[column - 1].focus()
        else row.focus()
        break
      case "Home":
      case "End":
        if (event.ctrlKey) sameColumn(rowFor(row, event.key))
        else (event.key === "Home" ? cells[0] : cells[cells.length - 1])?.focus()
        break
      case "Enter": {
        // A link opens; any other control takes focus so its own keys work.
        const widget = cell.querySelector<HTMLElement>(
          `:is(${WIDGET}):not([data-slot=treegrid-toggle])`
        )
        if (widget instanceof HTMLAnchorElement) widget.click()
        else widget?.focus()
        break
      }
      default:
        if (!VERTICAL_KEYS.has(event.key)) return
        sameColumn(rowFor(row, event.key))
    }
    event.preventDefault()
  }

  const Comp = asChild ? Slot.Root : rowHeader ? "th" : "td"
  return (
    <Comp
      role={rowHeader ? "rowheader" : "gridcell"}
      scope={rowHeader && !asChild ? "row" : undefined}
      tabIndex={-1}
      data-slot="treegrid-cell"
      className={cn(
        "outline-none focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:ring-inset",
        className
      )}
      onKeyDown={onKeyDown}
      {...props}
    />
  )
}

/**
 * The caret in a row's first cell, for the pointer: keyboard users expand with the arrow keys,
 * so it is never a tab stop. Leaves (`expanded` undefined) get an 18px spacer so names align.
 */
function TreegridToggle({
  expanded,
  onExpandedChange,
  label,
  className,
}: {
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  /** The row's name, for "Expand <name>" / "Collapse <name>". */
  label: string
  className?: string
}) {
  if (expanded === undefined) {
    return <span aria-hidden className="inline-block size-4.5 shrink-0" />
  }
  return (
    <button
      type="button"
      tabIndex={-1}
      data-slot="treegrid-toggle"
      aria-label={`${expanded ? "Collapse" : "Expand"} ${label}`}
      onClick={() => onExpandedChange?.(!expanded)}
      className={cn(
        "shrink-0 rounded p-0.5 text-muted-foreground outline-none hover:bg-muted hover:text-foreground",
        className
      )}
    >
      <ChevronRightIcon
        className={cn(
          "size-3.5 transition-transform duration-150 ease-out motion-reduce:transition-none",
          expanded && "rotate-90"
        )}
      />
    </button>
  )
}

export { Treegrid, TreegridRow, TreegridCell, TreegridToggle }
