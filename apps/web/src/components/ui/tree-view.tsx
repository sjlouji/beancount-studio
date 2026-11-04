"use client"

import * as React from "react"
import { cn } from "cn"
import { ChevronRightIcon } from "lucide-react"

import { Spinner } from "@/components/ui/spinner"

// The APG tree view, hand-built (Radix has no tree). One tab stop: while focus is in the tree
// it is the focused item, otherwise the selected item, else the first. Up/Down move between
// visible items, Right opens a branch or enters it, Left closes it or goes to the parent,
// Home/End jump to the ends, Enter activates, Space selects, a printable character jumps to
// the next item starting with it, and * opens every sibling branch. Focus is moved with the
// DOM because items mount and unmount as branches open and close.

const ITEM = "[role=treeitem]"

type ExpandSource = "keyboard" | "pointer"

interface TreeContextValue {
  selectedId: string | null
  expanded: string[]
  /** Pointer-driven expansion animates the new group in; keyboard-driven expansion doesn't. */
  animate: boolean
  setOpen: (ids: string[], open: boolean, source: ExpandSource) => void
  select: (id: string) => void
  activate: (id: string) => void
}

const TreeContext = React.createContext<TreeContextValue | null>(null)
const LevelContext = React.createContext(1)
const PositionContext = React.createContext({ posinset: 1, setsize: 1 })

function useTree() {
  const context = React.useContext(TreeContext)
  if (!context) throw new Error("TreeItem must be rendered inside a Tree")
  return context
}

function useControllable<T>(
  value: T | undefined,
  defaultValue: T,
  onChange: ((next: T) => void) | undefined
): [T, (next: T) => void] {
  const [inner, setInner] = React.useState(defaultValue)
  const current = value !== undefined ? value : inner
  const set = (next: T) => {
    if (value === undefined) setInner(next)
    onChange?.(next)
  }
  return [current, set]
}

/** Gives each child item its 1-based position among its siblings. */
function positioned(children: React.ReactNode) {
  const items = React.Children.toArray(children).filter(React.isValidElement)
  return items.map((child, index) => (
    <PositionContext
      key={child.key ?? index}
      value={{ posinset: index + 1, setsize: items.length }}
    >
      {child}
    </PositionContext>
  ))
}

function itemsOf(tree: Element) {
  return Array.from(tree.querySelectorAll<HTMLElement>(ITEM))
}

function labelOf(item: Element) {
  return (
    item
      .querySelector(":scope > [data-slot=tree-item-row] [data-slot=tree-item-label]")
      ?.textContent?.trim()
      .toLowerCase() ?? ""
  )
}

function syncTabStops(tree: HTMLElement, focusedId: string | null, selectedId: string | null) {
  const items = itemsOf(tree)
  const current =
    items.find((item) => item.dataset.id === focusedId) ??
    items.find((item) => item.dataset.id === selectedId) ??
    items[0]
  for (const item of items) item.tabIndex = item === current ? 0 : -1
}

function Tree({
  className,
  children,
  selectedId: selectedIdProp,
  defaultSelectedId = null,
  onSelectedChange,
  expanded: expandedProp,
  defaultExpanded = [],
  onExpandedChange,
  onActivate,
  selectionFollowsFocus = false,
  ...props
}: Omit<React.ComponentProps<"ul">, "onKeyDown" | "onFocus" | "onBlur"> & {
  "aria-label": string
  selectedId?: string | null
  defaultSelectedId?: string | null
  onSelectedChange?: (id: string | null) => void
  expanded?: string[]
  defaultExpanded?: string[]
  onExpandedChange?: (ids: string[]) => void
  /** Enter, or a click on a leaf: open the file, pick the account. */
  onActivate?: (id: string) => void
  selectionFollowsFocus?: boolean
}) {
  const [selectedId, setSelectedId] = useControllable(selectedIdProp, defaultSelectedId, onSelectedChange)
  const [expanded, setExpanded] = useControllable(expandedProp, defaultExpanded, onExpandedChange)
  const [animate, setAnimate] = React.useState(false)
  const treeRef = React.useRef<HTMLUListElement>(null)
  const focusedId = React.useRef<string | null>(null)

  React.useLayoutEffect(() => {
    if (treeRef.current) syncTabStops(treeRef.current, focusedId.current, selectedId)
  })

  const context: TreeContextValue = {
    selectedId,
    expanded,
    animate,
    setOpen: (ids, open, source) => {
      setAnimate(source === "pointer")
      const next = new Set(expanded)
      for (const id of ids) {
        if (open) next.add(id)
        else next.delete(id)
      }
      setExpanded(Array.from(next))
    },
    select: (id) => {
      if (id !== selectedId) setSelectedId(id)
    },
    activate: (id) => onActivate?.(id),
  }

  function focusItem(item: HTMLElement | null | undefined) {
    if (!item) return
    item.focus()
    if (selectionFollowsFocus && item.getAttribute("aria-disabled") !== "true") {
      context.select(item.dataset.id!)
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLUListElement>) {
    const item = event.target as HTMLElement
    if (item.getAttribute("role") !== "treeitem") return
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const items = itemsOf(event.currentTarget)
    const index = items.indexOf(item)
    const id = item.dataset.id!
    const state = item.getAttribute("aria-expanded")
    const disabled = item.getAttribute("aria-disabled") === "true"
    switch (event.key) {
      case "ArrowDown":
        focusItem(items[index + 1])
        break
      case "ArrowUp":
        focusItem(items[index - 1])
        break
      case "ArrowRight": {
        if (state === "false" && !disabled) context.setOpen([id], true, "keyboard")
        const next = items[index + 1]
        if (state === "true" && next?.parentElement?.closest(ITEM) === item) focusItem(next)
        break
      }
      case "ArrowLeft":
        if (state === "true" && !disabled) context.setOpen([id], false, "keyboard")
        else focusItem(item.parentElement?.closest<HTMLElement>(ITEM))
        break
      case "Home":
        focusItem(items[0])
        break
      case "End":
        focusItem(items[items.length - 1])
        break
      case "Enter":
        if (disabled) break
        context.select(id)
        context.activate(id)
        break
      case " ":
        if (!disabled && !selectionFollowsFocus) context.select(id)
        break
      case "*": {
        const siblings = Array.from(item.parentElement?.children ?? []).filter(
          (sibling): sibling is HTMLElement =>
            sibling instanceof HTMLElement &&
            sibling.getAttribute("aria-expanded") === "false" &&
            sibling.getAttribute("aria-disabled") !== "true"
        )
        context.setOpen(siblings.map((sibling) => sibling.dataset.id!), true, "keyboard")
        break
      }
      default: {
        if (event.key.length !== 1 || event.key === " ") return
        const char = event.key.toLowerCase()
        const ordered = [...items.slice(index + 1), ...items.slice(0, index)]
        focusItem(ordered.find((candidate) => labelOf(candidate).startsWith(char)))
      }
    }
    event.preventDefault()
  }

  return (
    <TreeContext value={context}>
      <ul
        ref={treeRef}
        role="tree"
        data-slot="tree"
        className={cn("flex flex-col gap-px", className)}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          const item = (event.target as HTMLElement).closest<HTMLElement>(ITEM)
          if (!item || !treeRef.current) return
          focusedId.current = item.dataset.id ?? null
          syncTabStops(treeRef.current, focusedId.current, selectedId)
        }}
        onBlur={(event) => {
          if (!treeRef.current || treeRef.current.contains(event.relatedTarget as Node | null)) return
          focusedId.current = null
          syncTabStops(treeRef.current, null, selectedId)
        }}
        {...props}
      >
        {positioned(children)}
      </ul>
    </TreeContext>
  )
}

function TreeItem({
  id,
  label,
  icon,
  trailing,
  hasChildren = false,
  loading = false,
  disabled = false,
  className,
  children,
}: {
  id: string
  label: React.ReactNode
  /** 16px icon (folder, file) in the secondary label colour. */
  icon?: React.ReactNode
  trailing?: React.ReactNode
  /** A branch whose children load later: it shows a caret before it has any. */
  hasChildren?: boolean
  /** The branch's children are loading: a spinner takes the caret's place. */
  loading?: boolean
  disabled?: boolean
  className?: string
  /** Nested `TreeItem`s. */
  children?: React.ReactNode
}) {
  const tree = useTree()
  const level = React.useContext(LevelContext)
  const { posinset, setsize } = React.useContext(PositionContext)
  const labelId = React.useId()
  const isBranch = hasChildren || React.Children.count(children) > 0
  const open = isBranch && tree.expanded.includes(id)
  const selected = tree.selectedId === id

  return (
    <li
      role="treeitem"
      data-slot="tree-item"
      data-id={id}
      aria-labelledby={labelId}
      aria-level={level}
      aria-posinset={posinset}
      aria-setsize={setsize}
      aria-expanded={isBranch ? open : undefined}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      className={cn(
        "outline-none [&:focus-visible>[data-slot=tree-item-row]]:ring-3 [&:focus-visible>[data-slot=tree-item-row]]:ring-ring/40",
        className
      )}
    >
      <div
        data-slot="tree-item-row"
        data-selected={selected}
        style={{ paddingLeft: `${0.25 + (level - 1)}rem` }}
        onClick={() => {
          if (disabled) return
          tree.select(id)
          if (isBranch) tree.setOpen([id], !open, "pointer")
          else tree.activate(id)
        }}
        className={cn(
          "flex h-11 cursor-pointer items-center gap-1.5 rounded-md pr-2 type-body select-none not-data-[selected=true]:hover:bg-accent data-[selected=true]:bg-primary data-[selected=true]:text-primary-foreground data-[selected=true]:[&_svg]:text-primary-foreground md:h-7",
          disabled && "pointer-events-none opacity-50"
        )}
      >
        <span aria-hidden className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {loading ? (
            <Spinner className="size-3.5" />
          ) : isBranch ? (
            <ChevronRightIcon
              className={cn(
                "size-3.5",
                tree.animate && "transition-transform duration-150 ease-out motion-reduce:transition-none",
                open && "rotate-90"
              )}
            />
          ) : null}
        </span>
        {icon && (
          <span aria-hidden className="flex shrink-0 text-muted-foreground [&_svg:not([class*='size-'])]:size-4">
            {icon}
          </span>
        )}
        <span id={labelId} data-slot="tree-item-label" className="min-w-0 flex-1 truncate">
          {label}
        </span>
        {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
      </div>
      {open && React.Children.count(children) > 0 && (
        <TreeGroup level={level + 1}>{children}</TreeGroup>
      )}
    </li>
  )
}

function TreeGroup({ level, children }: { level: number; children: React.ReactNode }) {
  const tree = useTree()
  // Decided once, at mount: groups already open must not replay the entrance later.
  const [animateIn] = React.useState(tree.animate)
  return (
    <ul
      role="group"
      data-slot="tree-group"
      className={cn("mt-px flex flex-col gap-px", animateIn && "animate-rise")}
    >
      <LevelContext value={level}>{positioned(children)}</LevelContext>
    </ul>
  )
}

export { Tree, TreeItem }
