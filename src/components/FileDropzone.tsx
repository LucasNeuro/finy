"use client";

import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";

type FileDropzoneProps = {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSize?: number;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
};

export function FileDropzone({
  onFileSelect,
  accept = "image/*",
  maxSize = 5 * 1024 * 1024,
  loading = false,
  disabled = false,
  label = "Arraste um arquivo aqui ou clique para selecionar",
  className = "",
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (file: File): string | null => {
    if (file.size > maxSize) {
      return `Arquivo muito grande. Máximo ${Math.round(maxSize / 1024 / 1024)}MB.`;
    }
    return null;
  };

  const handleFile = (file: File | null) => {
    setError(null);
    if (!file) return;
    const err = validate(file);
    if (err) {
      setError(err);
      return;
    }
    onFileSelect(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled || loading) return;
    const file = e.dataTransfer.files?.[0];
    handleFile(file ?? null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled || loading) return;
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    handleFile(file ?? null);
    e.target.value = "";
  };

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={0}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && !loading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!disabled && !loading) inputRef.current?.click();
          }
        }}
        className={`
          relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors
          ${disabled || loading ? "cursor-not-allowed bg-[#F8FAFC] border-[#E2E8F0]" : "cursor-pointer"}
          ${isDragging ? "border-clicvend-orange bg-[#FFF7ED]" : "border-[#E2E8F0] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]"}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleChange}
          className="sr-only"
          disabled={disabled || loading}
        />
        {loading ? (
          <Loader2 className="h-10 w-10 animate-spin text-clicvend-orange mb-2" />
        ) : (
          <Upload className="h-10 w-10 text-[#94A3B8] mb-2" />
        )}
        <p className="text-sm text-[#64748B]">{label}</p>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}
