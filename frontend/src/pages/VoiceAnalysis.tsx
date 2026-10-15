import { useState, type FormEvent } from "react";
import { analyzeAudio, ApiRequestError } from "../services/api";
import { AudioUpload } from "../components/AudioUpload";
import { ResultsDashboard } from "../components/ResultsDashboard";
import { MAX_AUDIO_BYTES } from "../types/analysis";
import type { AnalysisResponse } from "../types/analysis";

type AppState = "ready" | "analyzing" | "completed" | "failed";

export function VoiceAnalysis() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [context, setContext] = useState("");
  const [transcript, setTranscript] = useState("");
  const [language, setLanguage] = useState("");
  const [contextError, setContextError] = useState<string | null>(null);
  const [status, setStatus] = useState<AppState>("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResponse | null>(null);

  const handleFileSelected = (file: File | null) => {
    setAudioError(null);
    if (!file) {
      setAudioFile(null);
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setAudioFile(null);
      setAudioError("File exceeds the 15 MB limit. Please choose a smaller WAV file.");
      return;
    }
    setAudioFile(file);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setContextError(null);
    setAudioError(null);
    setErrorMessage(null);

    if (!audioFile) {
      setAudioError("Please select a WAV audio file.");
      return;
    }
    if (!context.trim()) {
      setContextError("Context is required. Describe the communication and circumstances.");
      return;
    }

    setStatus("analyzing");
    setResult(null);

    try {
      const response = await analyzeAudio({
        audio: audioFile,
        context: context.trim(),
        transcript,
        language,
      });
      setResult(response);
      setStatus("completed");
    } catch (error) {
      let message = "An unexpected error occurred. Please retry.";
      if (error instanceof ApiRequestError) {
        message = error.message;
      } else if (error instanceof Error) {
        message = error.message;
      }
      setErrorMessage(message);
      setStatus("failed");
    }
  };

  const handleNewAnalysis = () => {
    setResult(null);
    setErrorMessage(null);
    setStatus("ready");
  };

  const handleReset = () => {
    setAudioFile(null);
    setAudioError(null);
    setContext("");
    setTranscript("");
    setLanguage("");
    setContextError(null);
    setErrorMessage(null);
    setResult(null);
    setStatus("ready");
  };

  const isAnalyzing = status === "analyzing";

  return (
    <section className="page" aria-labelledby="voice-title">
      <div className="page-head">
        <p className="eyebrow">Voice analysis</p>
        <h2 className="page-title" id="voice-title">
          Analyze a voice sample
        </h2>
        <p className="page-lede">
          Assess technical audio properties and contextual warning signs for a WAV
          recording. Results describe signals to review — not proof of voice authenticity.
        </p>
        <p className="notice notice-warn">
          <span className="notice-icon" aria-hidden="true">
            !
          </span>
          <span>
            Contextual risk alone does not establish voice authenticity. A low score is not
            proof of safety.
          </span>
        </p>
      </div>

      {status !== "completed" ? (
        <form className="stack" onSubmit={handleSubmit} noValidate>
          <div className="card">
            <AudioUpload
              file={audioFile}
              error={audioError}
              onFileSelected={handleFileSelected}
              onClear={() => setAudioFile(null)}
              disabled={isAnalyzing}
            />
          </div>

          <div className="card">
            <div className="field">
              <label className="field-label" htmlFor="context">
                Communication context <span className="required">*</span>
              </label>
              <p className="field-hint" id="context-help">
                Required: describe the communication and circumstances. This helps
                identify contextual warning signs such as urgency or secrecy.
              </p>
              <textarea
                id="context"
                value={context}
                onChange={(event) => setContext(event.target.value)}
                disabled={isAnalyzing}
                rows={4}
                aria-describedby="context-help"
              />
              {contextError ? (
                <p className="field-error" role="alert">
                  {contextError}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label className="field-label" htmlFor="transcript">
                Transcript (optional)
              </label>
              <textarea
                id="transcript"
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                disabled={isAnalyzing}
                rows={3}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="language">
                Language (optional)
              </label>
              <input
                id="language"
                type="text"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                disabled={isAnalyzing}
                placeholder="e.g. en"
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={isAnalyzing}>
              {isAnalyzing ? "Analyzing..." : "Analyze"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleReset}
              disabled={isAnalyzing}
            >
              Reset
            </button>
          </div>

          {isAnalyzing ? (
            <p className="status-live" role="status" aria-live="polite">
              <span className="spinner" aria-hidden="true" />
              Uploading and analyzing audio. This may take a moment...
            </p>
          ) : null}

          {status === "failed" && errorMessage ? (
            <p className="error-banner" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </form>
      ) : null}

      {status === "completed" && result ? (
        <ResultsDashboard result={result} onNewAnalysis={handleNewAnalysis} />
      ) : null}
    </section>
  );
}
