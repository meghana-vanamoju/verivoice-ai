import { useState } from "react";
import "./App.css";
import { analyzeAudio, ApiRequestError } from "./services/api";
import { AudioUpload } from "./components/AudioUpload";
import { ResultsDashboard } from "./components/ResultsDashboard";
import { MAX_AUDIO_BYTES } from "./types/analysis";
import type { AnalysisResponse } from "./types/analysis";

type AppState = "ready" | "analyzing" | "completed" | "failed";

export default function App() {
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

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
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
    <div className="app-shell">
      <header className="app-header">
        <h1>VeriVoice AI</h1>
        <p>
          Intelligent Voice Impersonation Defense System. Assess technical audio
          properties and contextual warning signs, not voice authenticity.
        </p>
        <p className="callout">
          Contextual risk alone does not establish voice authenticity. A low score is
          not proof of safety.
        </p>
      </header>

      <main>
        {status !== "completed" ? (
          <form className="analysis-form" onSubmit={handleSubmit} noValidate>
            <AudioUpload
              file={audioFile}
              error={audioError}
              onFileSelected={handleFileSelected}
              onClear={() => setAudioFile(null)}
              disabled={isAnalyzing}
            />

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
              <label className="field-label" htmlFor="transcript">Transcript (optional)</label>
              <textarea
                id="transcript"
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                disabled={isAnalyzing}
                rows={3}
              />
            </div>

            <div className="field">
              <label className="field-label" htmlFor="language">Language (optional)</label>
              <input
                id="language"
                type="text"
                value={language}
                onChange={(event) => setLanguage(event.target.value)}
                disabled={isAnalyzing}
                placeholder="e.g. en"
              />
            </div>

            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={isAnalyzing}>
                {isAnalyzing ? "Analyzing..." : "Analyze"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={handleReset}
                disabled={isAnalyzing}
              >
                Reset
              </button>
            </div>

            {isAnalyzing ? (
              <p className="status-live" role="status" aria-live="polite">
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
      </main>
    </div>
  );
}
