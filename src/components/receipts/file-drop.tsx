'use client';

import { useRef, useState } from 'react';
import { Icon } from '@/components/icon';
import { fileSize } from '@/lib/format';

/* Choose a file, or drag one in.

   The checks here are a courtesy, so somebody is told at once that a 40 MB
   scan will not go rather than after it has uploaded. The API reads the bytes
   and is the one that decides; a renamed file that gets past this is refused
   there. */

export function FileDrop({
  accept,
  maxBytes,
  title,
  hint,
  file,
  onFile,
  disabled,
  thumb = 'receipt',
}: {
  accept: string;
  maxBytes: number;
  title: string;
  hint: string;
  file: File | null;
  onFile: (file: File | null) => void;
  disabled?: boolean;
  thumb?: 'receipt' | 'file';
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const extensions = accept.split(',').map((s) => s.trim().toLowerCase());

  function take(chosen: File | undefined) {
    if (!chosen) return;
    const ext = `.${chosen.name.split('.').pop()?.toLowerCase() ?? ''}`;
    if (!extensions.includes(ext)) {
      setProblem(`That is a ${ext} file. ${hint.split(' · ')[0]} only.`);
      return;
    }
    if (chosen.size > maxBytes) {
      setProblem(`That file is ${fileSize(chosen.size)}. The limit is ${fileSize(maxBytes)}.`);
      return;
    }
    setProblem(null);
    onFile(chosen);
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {file ? (
        <div className="attached">
          <span className="thumb">
            <Icon name={file.type === 'application/pdf' || thumb === 'file' ? 'file' : 'receipt'} size={20} />
          </span>
          <span>
            <span className="nm">{file.name}</span>
            <br />
            <span className="sz">{fileSize(file.size)} · ready to attach</span>
          </span>
          <button
            type="button"
            className="rm"
            aria-label="Remove this file"
            onClick={() => onFile(null)}
          >
            <Icon name="trash" size={17} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="drop"
          style={{ width: '100%', ...(over ? { borderColor: 'var(--accent-600)' } : {}) }}
          disabled={disabled}
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            if (!disabled) take(e.dataTransfer.files?.[0]);
          }}
        >
          <Icon name="upload" size={26} />
          <b>{title}</b>
          {hint}
        </button>
      )}

      {problem && (
        <p className="err-msg" role="alert" style={{ marginTop: 8 }}>
          <Icon name="alert" size={17} />
          {problem}
        </p>
      )}
    </>
  );
}

export const RECEIPT_ACCEPT = '.jpg,.jpeg,.png,.heic,.heif,.webp,.pdf';
export const RECEIPT_HINT = 'JPG, PNG, HEIC or PDF · up to 10 MB each';
export const RECEIPT_MAX = 10 * 1024 * 1024;
