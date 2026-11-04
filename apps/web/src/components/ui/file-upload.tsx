"use client"

import * as React from "react"
import { cn } from "cn"
import { UploadCloudIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { formatBytes } from "@/lib/format"

// DESIGN.md file upload: a dashed drop zone with a real "Choose file" button. The button is the
// keyboard path (the zone is not a second tab stop); clicking anywhere on the zone opens the same
// picker for the mouse. Files that fail `accept`, `maxSize` or the file count are never dropped
// quietly: each one gets a line in the alert under the zone and goes to `onReject`.

type FileRejection = {
  file: File
  reason: "type" | "size" | "count"
  message: string
}

/** Same rules as the native `accept` attribute: `.ext`, `type/*` and exact MIME types. */
function matchesAccept(file: File, accept: string | undefined) {
  if (!accept) return true
  const name = file.name.toLowerCase()
  const type = file.type.toLowerCase()
  return accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
    .some((token) => {
      if (token.startsWith(".")) return name.endsWith(token)
      if (token.endsWith("/*")) return type.startsWith(token.slice(0, -1))
      return type === token
    })
}

function FileUpload({
  accept,
  multiple = false,
  maxSize,
  maxFiles,
  onFiles,
  onReject,
  busy = false,
  busyLabel = "Uploading…",
  disabled = false,
  compact = false,
  title,
  hint,
  icon,
  className,
  children,
}: {
  /** Native `accept` syntax; also checked on drop, where the browser does not filter. */
  accept?: string
  multiple?: boolean
  /** Largest file in bytes. */
  maxSize?: number
  /** Most files taken from one pick or drop (1 unless `multiple`). */
  maxFiles?: number
  /** Called with the accepted files of a pick or drop; never with an empty list. */
  onFiles: (files: File[]) => void
  onReject?: (rejections: FileRejection[]) => void
  busy?: boolean
  busyLabel?: string
  disabled?: boolean
  compact?: boolean
  title?: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  className?: string
  /** The selected files (a FileUploadList), rendered under the zone. */
  children?: React.ReactNode
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const hintId = React.useId()
  const [dragging, setDragging] = React.useState(false)
  const [rejections, setRejections] = React.useState<FileRejection[]>([])
  const [announcement, setAnnouncement] = React.useState("")
  const inactive = busy || disabled

  function openPicker() {
    if (!inactive) inputRef.current?.click()
  }

  function take(incoming: File[]) {
    const limit = multiple ? (maxFiles ?? Infinity) : 1
    const accepted: File[] = []
    const rejected: FileRejection[] = []
    const seen = new Set<string>()
    for (const file of incoming) {
      // The same file twice in one pick or drop counts once.
      const key = `${file.name}:${file.size}`
      if (seen.has(key)) continue
      seen.add(key)
      if (!matchesAccept(file, accept)) {
        rejected.push({ file, reason: "type", message: `${file.name} isn't a file type that can be added here.` })
      } else if (maxSize !== undefined && file.size > maxSize) {
        rejected.push({ file, reason: "size", message: `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(maxSize)}.` })
      } else if (accepted.length >= limit) {
        rejected.push({
          file,
          reason: "count",
          message: multiple ? `${file.name} wasn't added: up to ${limit} files at a time.` : `${file.name} wasn't added: one file at a time.`,
        })
      } else {
        accepted.push(file)
      }
    }
    setRejections(rejected)
    if (rejected.length > 0) onReject?.(rejected)
    if (accepted.length > 0) {
      setAnnouncement(accepted.length === 1 ? `Added ${accepted[0].name}` : `Added ${accepted.length} files`)
      onFiles(accepted)
    }
  }

  return (
    <div data-slot="file-upload" className={cn("space-y-3", className)}>
      <input
        ref={inputRef}
        type="file"
        hidden
        tabIndex={-1}
        accept={accept}
        multiple={multiple}
        disabled={inactive}
        onChange={(event) => {
          if (event.target.files) take(Array.from(event.target.files))
          // Reset so picking the same file again still fires a change.
          event.target.value = ""
        }}
      />
      <div
        data-slot="file-upload-zone"
        data-dragging={dragging || undefined}
        data-disabled={inactive || undefined}
        aria-busy={busy || undefined}
        onClick={openPicker}
        onDragOver={(event) => {
          // Always claim the drag, so a drop on a busy zone doesn't make the browser open the file.
          event.preventDefault()
          event.dataTransfer.dropEffect = inactive ? "none" : "copy"
          if (!inactive) setDragging(true)
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        }}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          if (!inactive && event.dataTransfer.files.length > 0) take(Array.from(event.dataTransfer.files))
        }}
        className={cn(
          "group/file-upload relative flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-card px-6 text-center hover:border-foreground/30 in-data-[slot=dialog-content]:bg-surface",
          compact ? "py-8" : "py-16",
          "data-dragging:border-primary data-dragging:bg-accent",
          "data-disabled:cursor-not-allowed data-disabled:opacity-50 data-disabled:hover:border-border",
          // On phones there is nothing to drag from: the zone shrinks to its button and hint.
          "max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:in-data-[slot=dialog-content]:bg-transparent"
        )}
      >
        <span
          aria-hidden
          className="flex size-14 items-center justify-center rounded-full bg-surface text-muted-foreground transition-transform duration-200 ease-out group-data-dragging/file-upload:scale-110 motion-reduce:transition-none max-md:hidden in-data-[slot=dialog-content]:bg-background [&_svg:not([class*='size-'])]:size-6"
        >
          {busy ? <Spinner className="size-6" /> : (icon ?? <UploadCloudIcon />)}
        </span>
        <div className="space-y-1">
          <p className="type-body font-medium max-md:hidden">{busy ? busyLabel : dragging ? "Release to upload" : title ?? (multiple ? "Drop files here" : "Drop a file here")}</p>
          {hint && (
            <div id={hintId} className="mx-auto max-w-md type-subhead text-muted-foreground">
              {hint}
            </div>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          data-slot="file-upload-trigger"
          aria-describedby={hint ? hintId : undefined}
          disabled={inactive}
          onClick={(event) => {
            // The zone's own click handler opens the picker; stop here so it opens once.
            event.stopPropagation()
            openPicker()
          }}
          className="max-md:order-first"
        >
          {busy && <Spinner data-icon="inline-start" className="md:hidden" />}
          {multiple ? "Choose files" : "Choose file"}
        </Button>
        <span role="status" className="sr-only">
          {announcement}
        </span>
        <span role="status" className="sr-only">
          {busy ? busyLabel : ""}
        </span>
      </div>
      {rejections.length > 0 && (
        <div data-slot="file-upload-error" role="alert" className="space-y-0.5 type-footnote text-negative">
          {rejections.map((rejection) => (
            <p key={`${rejection.file.name}:${rejection.file.size}`}>{rejection.message}</p>
          ))}
        </div>
      )}
      {children}
    </div>
  )
}

/** A list of File rows ("Files to upload"), scrolling after about five rows. */
function FileUploadList({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="file-upload-list"
      className={cn("max-h-56 divide-y overflow-y-auto rounded-md border scrollbar-thin", className)}
      {...props}
    />
  )
}

export { FileUpload, FileUploadList, type FileRejection }
