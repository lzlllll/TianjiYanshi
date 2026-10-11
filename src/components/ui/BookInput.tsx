import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface BookInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function BookInput({ 
  className, 
  label, 
  error,
  ...props 
}: BookInputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="text-label block mb-2">
          {label}
        </label>
      )}
      <input
        className={cn(
          "book-input w-full",
          error && "border-cinnabar focus:border-cinnabar",
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-caption text-cinnabar mt-1">
          {error}
        </p>
      )}
    </div>
  );
}

interface BookTextareaProps extends InputHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  rows?: number;
}

export function BookTextarea({ 
  className, 
  label, 
  error,
  rows = 4,
  ...props 
}: BookTextareaProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="text-label block mb-2">
          {label}
        </label>
      )}
      <textarea
        className={cn(
          "book-input w-full resize-none",
          error && "border-cinnabar focus:border-cinnabar",
          className
        )}
        rows={rows}
        {...props}
      />
      {error && (
        <p className="text-caption text-cinnabar mt-1">
          {error}
        </p>
      )}
    </div>
  );
}
