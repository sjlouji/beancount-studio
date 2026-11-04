"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import {
  BracesIcon,
  DownloadIcon,
  FileIcon as GenericFileIcon,
  FileTextIcon,
  ImageIcon,
  MusicIcon,
  RotateCcwIcon,
  VideoIcon,
  XIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { formatBytes } from "@/lib/format"

// DESIGN.md file row: one attached or queued file, with a type icon, name, size and actions. The
// row itself is not focusable; only its actions are. Exported as FileRoot/FileIcon/… rather than
// `File`, which would shadow the DOM `File` type in every module that imports it.
const fileVariants = cva("flex min-w-0 items-center gap-2 rounded-md", {
  variants: {
    variant: {
      outline: "border border-border hover:bg-muted/50",
      ghost: "hover:bg-muted/50",
      muted: "bg-muted/50",
    },
    size: {
      sm: "px-2.5 py-1.5",
      default: "px-3 py-2",
      lg: "px-4 py-3",
    },
  },
  defaultVariants: {
    variant: "outline",
    size: "default",
  },
})

function FileRoot({
  className,
  variant = "outline",
  size = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof fileVariants>) {
  return (
    <div
      data-slot="file"
      data-variant={variant}
      data-size={size}
      className={cn(fileVariants({ variant, size }), className)}
      {...props}
    />
  )
}

const FILE_ICONS = {
  image: ImageIcon,
  text: FileTextIcon,
  json: BracesIcon,
  audio: MusicIcon,
  video: VideoIcon,
  generic: GenericFileIcon,
}

function iconKind(mimeType: string): keyof typeof FILE_ICONS {
  const type = mimeType.toLowerCase()
  if (type.startsWith("image/")) return "image"
  if (type === "application/pdf" || type.startsWith("text/")) return "text"
  if (type === "application/json") return "json"
  if (type.startsWith("audio/")) return "audio"
  if (type.startsWith("video/")) return "video"
  return "generic"
}

function FileIcon({ mimeType = "", className, ...props }: React.ComponentProps<"svg"> & { mimeType?: string }) {
  const Icon = FILE_ICONS[iconKind(mimeType)]
  return (
    <Icon
      data-slot="file-icon"
      aria-hidden
      className={cn("size-5 shrink-0 text-muted-foreground", className)}
      {...props}
    />
  )
}

function FileName({
  className,
  mono = false,
  children,
  ...props
}: React.ComponentProps<"span"> & { mono?: boolean; children: string }) {
  return (
    <span
      data-slot="file-name"
      // Truncated names keep the full name one hover away.
      title={children}
      className={cn("min-w-0 truncate", mono ? "font-mono text-[13px]" : "type-subhead font-medium", className)}
      {...props}
    >
      {children}
    </span>
  )
}

function FileSize({ bytes, className, ...props }: React.ComponentProps<"span"> & { bytes: number }) {
  return (
    <span
      data-slot="file-size"
      className={cn("tabular shrink-0 type-footnote text-muted-foreground", className)}
      {...props}
    >
      {formatBytes(bytes)}
    </span>
  )
}

/**
 * Only same-origin paths and http(s), blob: and data: URLs are linked; anything with another
 * scheme (javascript:, file:, …) is refused, as the assistant's file part does.
 */
function safeHref(href: string): string | null {
  if (/^[a-z][a-z\d+.-]*:/i.test(href) && !/^(https?:\/\/|blob:|data:)/i.test(href)) return null
  return href
}

function FileDownload({
  href,
  filename,
  className,
  ...props
}: Omit<React.ComponentProps<"a">, "href" | "download"> & { href: string; filename: string }) {
  const safe = safeHref(href)
  if (!safe) return null
  return (
    <Button asChild variant="ghost" size="icon-xs" className={cn("text-muted-foreground", className)}>
      <a data-slot="file-download" href={safe} download={filename} aria-label={`Download ${filename}`} {...props}>
        <DownloadIcon />
      </a>
    </Button>
  )
}

/**
 * Removes the file, then moves focus to the next row's remove button (the previous row's when the
 * last row goes), or to the FileUpload button when the list is empty, so keyboard focus is never
 * dropped on the body.
 */
function FileRemove({
  name,
  onRemove,
  className,
  onClick,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "children"> & { name: string; onRemove: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      data-slot="file-remove"
      aria-label={`Remove ${name}`}
      className={cn("text-muted-foreground", className)}
      onClick={(event) => {
        onClick?.(event)
        const row = event.currentTarget.closest("li")
        const next =
          (row?.nextElementSibling ?? row?.previousElementSibling)?.querySelector<HTMLElement>("[data-slot=file-remove]") ??
          event.currentTarget.closest("[data-slot=file-upload]")?.querySelector<HTMLElement>("[data-slot=file-upload-trigger]")
        onRemove()
        next?.focus()
      }}
      {...props}
    >
      <XIcon />
    </Button>
  )
}

/** Upload progress (0–100) or an error line for one file. */
function FileStatus({
  name,
  progress,
  error,
  className,
  ...props
}: React.ComponentProps<"div"> & { name: string; progress?: number; error?: string }) {
  if (error) {
    return (
      <div data-slot="file-status" role="alert" className={cn("type-footnote text-negative", className)} {...props}>
        {error}
      </div>
    )
  }
  if (progress === undefined) return null
  return (
    <div data-slot="file-status" className={cn("flex items-center gap-2", className)} {...props}>
      <Progress value={progress} aria-label={`Uploading ${name}`} className="flex-1" />
      <span className="tabular w-9 shrink-0 text-right type-footnote text-muted-foreground">{progress}%</span>
    </div>
  )
}

/** Shorthand for the common row: icon, name and size, status, then download / retry / remove. */
function FileItem({
  name,
  size: bytes,
  mimeType,
  mono,
  href,
  onRemove,
  onRetry,
  progress,
  error,
  disabled = false,
  ...props
}: Omit<React.ComponentProps<typeof FileRoot>, "children" | "size"> & {
  name: string
  /** Size in bytes. */
  size: number
  mimeType?: string
  /** Ledger paths read in mono. */
  mono?: boolean
  href?: string
  onRemove?: () => void
  onRetry?: () => void
  progress?: number
  error?: string
  /** Turns the actions off, e.g. while an upload is in flight. */
  disabled?: boolean
}) {
  return (
    <FileRoot {...props}>
      <FileIcon mimeType={mimeType} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 items-baseline gap-2">
          <FileName mono={mono} className="flex-1">
            {name}
          </FileName>
          <FileSize bytes={bytes} />
        </div>
        <FileStatus name={name} progress={progress} error={error} />
      </div>
      {error && onRetry && (
        <Button type="button" variant="ghost" size="icon-xs" aria-label={`Retry ${name}`} className="text-muted-foreground" disabled={disabled} onClick={onRetry}>
          <RotateCcwIcon />
        </Button>
      )}
      {href && <FileDownload href={href} filename={name} />}
      {onRemove && <FileRemove name={name} onRemove={onRemove} disabled={disabled} />}
    </FileRoot>
  )
}

export { FileRoot, FileIcon, FileName, FileSize, FileDownload, FileRemove, FileStatus, FileItem }
