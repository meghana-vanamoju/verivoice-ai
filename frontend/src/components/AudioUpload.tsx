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
    <div className="upload">
      <label className="field-label" htmlFor="audio-input">
        Audio file <span className="required">*</span>
      </label>
      <p className="field-hint">
        WAV audio up to 15 MB. Extension or MIME type is only a preliminary check; the
        backend validates the actual audio.
      </p>
      <div
        className={[
          "dropzone",
          isDragging ? "dropzone-dragging" : "",
          disabled ? "dropzone-disabled" : "",
        ]
          .filter(Boolean)
          .join(" ")}
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
          className="visually-hidden"
          accept=".wav,audio/wav,audio/x-wav,audio/wave"
          onChange={(event) => handleFiles(event.target.files)}
          disabled={disabled}
          aria-describedby="audio-help"
        />
        <span className="dropzone-glyph" aria-hidden="true">
          <WaveGlyph />
        </span>
        <button
          type="button"
          className="btn btn-secondary"
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
          <span className="selected-file-icon" aria-hidden="true">
            <AudioFileGlyph />
          </span>
          <span className="selected-file-name">{file.name}</span>
          <span className="selected-file-size">{formatBytes(file.size)}</span>
          <button type="button" className="link-button" onClick={onClear} disabled={disabled}>
            Remove
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
      {file && !isWavFile(file) ? (
        <p className="field-warning" role="status">
          The selected file does not look like a WAV file by extension or MIME type.
        </p>
      ) : null}
    </div>
  );
}

/** Subtle waveform treatment for the drop zone. */
function WaveGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <line x1="5" y1="10" x2="5" y2="14" />
        <line x1="9" y1="7" x2="9" y2="17" />
        <line x1="13" y1="4" x2="13" y2="20" />
        <line x1="17" y1="8" x2="17" y2="16" />
        <line x1="21" y1="10.5" x2="21" y2="13.5" />
      </g>
    </svg>
  );
}

function AudioFileGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3v4a1 1 0 0 0 1 1h4" />
      <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M9 14v3M12 12v5M15 15v2" />
    </svg>
  );
}
