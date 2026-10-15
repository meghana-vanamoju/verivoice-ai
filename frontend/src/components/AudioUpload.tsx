import { useRef, useState } from "react";

const ACCEPTED_EXTENSIONS = [".wav"];
const ACCEPTED_MIME = ["audio/wav", "audio/x-wav", "audio/wave"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isWavFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return (
    ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext)) ||
    ACCEPTED_MIME.includes(file.type.toLowerCase())
  );
}

interface Props {
  file: File | null;
  error: string | null;
  onFileSelected: (file: File | null) => void;
  onClear: () => void;
  disabled?: boolean;
}

export function AudioUpload({ file, error, onFileSelected, onClear, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const selected = files[0];
    onFileSelected(selected);
  };

  return (
    <div className="field">
      <label className="field-label" htmlFor="audio-input">
        Audio file <span className="required">*</span>
      </label>
      <p className="field-hint">
        WAV audio up to 15 MB. Extension or MIME type is only a preliminary check; the
        backend validates the actual audio.
      </p>
      <div
        className={`dropzone ${isDragging ? "dropzone-dragging" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          if (disabled) return;
          handleFiles(event.dataTransfer.files);
        }}
      >
        <input
          id="audio-input"
          ref={inputRef}
          type="file"
          accept=".wav,audio/wav,audio/x-wav,audio/wave"
          onChange={(event) => handleFiles(event.target.files)}
          disabled={disabled}
          aria-describedby="audio-help"
        />
        <button
          type="button"
          className="secondary-button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
        >
          Choose WAV file
        </button>
        <span className="dropzone-text" id="audio-help">
          or drag and drop a WAV file here
        </span>
      </div>

      {file ? (
        <div className="selected-file">
          <span className="selected-file-name">{file.name}</span>
          <span className="selected-file-size">{formatBytes(file.size)}</span>
          <button type="button" className="link-button" onClick={onClear} disabled={disabled}>
            Remove
          </button>
        </div>
      ) : null}

      {error ? <p className="field-error" role="alert">{error}</p> : null}
      {file && !isWavFile(file) ? (
        <p className="field-warning" role="status">
          The selected file does not look like a WAV file by extension or MIME type.
        </p>
      ) : null}
    </div>
  );
}
