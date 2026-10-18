"use client";

import { UploadCloud } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { cn } from "./ui";

/**
 * Drag-and-drop file target that is also a keyboard-accessible button. On phones, `capture`
 * opens the camera directly while still allowing a pick from the library.
 */
export function Dropzone({
  accept,
  multiple = false,
  capture,
  onFiles,
  title,
  hint,
  disabled,
  compact = false,
}: {
  accept: string;
  multiple?: boolean;
  capture?: "user" | "environment";
  onFiles: (files: File[]) => void;
  title: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) take(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
        compact ? "px-4 py-6" : "px-6 py-10",
        over ? "border-brand-500 bg-brand-50 dark:bg-brand-900/40" : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900/60 dark:hover:border-slate-500 dark:hover:bg-slate-800",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <UploadCloud className={cn("mb-2 text-slate-400", compact ? "h-6 w-6" : "h-8 w-8")} strokeWidth={1.5} />
      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
      {hint && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        {...(capture ? { capture } : {})}
        className="hidden"
        onChange={(e) => {
          take(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
