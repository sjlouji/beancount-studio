"use client";

import type { ReactNode } from "react";
import { FileUpload } from "@/components/ui/file-upload";

/** Single-file FileUpload for the import wizard and the receipt page, with their default copy. */
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
  return (
    <FileUpload
      accept={accept}
      onFiles={([file]) => onFile(file)}
      busy={busy}
      busyLabel={busyLabel}
      title={title}
      hint={hint}
      icon={icon}
      compact={compact}
      disabled={disabled}
    />
  );
}
