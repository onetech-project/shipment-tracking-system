'use client';
import React, { useRef, useCallback, useState } from 'react';

interface PdfUploaderProps {
  onUpload: (file: File) => void;
  isUploading: boolean;
}

export default function PdfUploader({ onUpload, isUploading }: PdfUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileTypeError, setFileTypeError] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
        onDragOver={(e) => e.preventDefault()}
        style={{
          border: '2px dashed #94a3b8',
          borderRadius: 8,
          padding: '2rem',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: '1rem',
        }}
        onClick={() => inputRef.current?.click()}
      >
        <p style={{ margin: 0, color: '#64748b' }}>
          {selectedFile ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)` : 'Click or drag-and-drop a PDF file here'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          style={{ display: 'none' }}
          onChange={handleChange}
        />
      </div>

      {fileTypeError && (
        <p data-testid="file-type-error" style={{ color: '#ef4444', marginBottom: '0.5rem' }}>
          Only PDF files are accepted.
        </p>
      )}

      <button
        data-testid="upload-submit"
        type="submit"
        disabled={!selectedFile || isUploading}
        style={{
          background: selectedFile && !isUploading ? '#3b82f6' : '#94a3b8',
          color: '#fff',
          border: 'none',
          padding: '0.5rem 1.5rem',
          borderRadius: 6,
          cursor: selectedFile && !isUploading ? 'pointer' : 'default',
        }}
      >
        {isUploading ? 'Uploading…' : 'Upload Shipments'}
      </button>
    </form>
  );
}
