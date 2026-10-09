"use client";

import { UploadCloudIcon } from "lucide-react";
import { useId, useRef, useState, type ReactNode } from "react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** Large drag-and-drop target that is also a button/file input. Single file. */
export function Dropzone({
  accept,
  onFile,
  busy = false,
  busyLabel = "Working…",
  title = "Drop a file here, or click to choose",
  hint,
  icon,
  compact = false,
  disabled = false,
}: {
  accept: string;
  onFile: (file: File) => void;
  busy?: boolean;
  busyLabel?: string;
  title?: string;
  hint?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
  disabled?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const inactive = busy || disabled;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!inactive) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file && !inactive) onFile(file);
      }}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card text-center transition-colors",
        compact ? "px-6 py-10" : "px-6 py-16",
        dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
        inactive && "pointer-events-none opacity-80",
      )}
    >
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={inactive}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
      <span className={cn("flex size-14 items-center justify-center rounded-full bg-surface text-muted-foreground transition-transform group-hover:scale-105", dragging && "scale-110 text-primary")}>
        {busy ? <Spinner className="size-6" /> : (icon ?? <UploadCloudIcon className="size-6" />)}
      </span>
      <div className="space-y-1">
        <label htmlFor={inputId} className="cursor-pointer text-base font-medium after:absolute after:inset-0 after:content-['']">
          {busy ? busyLabel : dragging ? "Release to upload" : title}
        </label>
        {hint && <p className="mx-auto max-w-md text-sm text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
