'use client';
import React, { useRef, useCallback, useState } from 'react';
import { AlertCircle, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PdfUploaderProps {
  onUpload: (file: File) => void;
  isUploading: boolean;
}

export default function PdfUploader({ onUpload, isUploading }: PdfUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileTypeError, setFileTypeError] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback((file: File) => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setFileTypeError(true);
      setSelectedFile(null);
      return;
    }
    setFileTypeError(false);
    setSelectedFile(file);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedFile) onUpload(selectedFile);
  };

  return (
    <form onSubmit={handleSubmit}>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center cursor-pointer',
          'motion-safe:transition-colors motion-safe:duration-200',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/30',
        )}
      >
        <FileUp className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {selectedFile
            ? <span className="font-medium text-foreground">{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
            : 'Click or drag-and-drop a PDF file here'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={handleChange}
        />
      </div>

      {fileTypeError && (
        <p data-testid="file-type-error" className="mt-2 flex items-center gap-1 text-sm text-destructive">
          <AlertCircle size={14} />
          Only PDF files are accepted.
        </p>
      )}

      <Button
        data-testid="upload-submit"
        type="submit"
        disabled={!selectedFile || isUploading}
        className="mt-4"
      >
        {isUploading ? 'Uploading…' : 'Upload Shipments'}
      </Button>
    </form>
  );
}
