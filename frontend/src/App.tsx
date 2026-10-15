import { FormEvent, useState } from "react";
import { analyzeContext } from "./services/context-analysis";
import type {
  ContextAnalysisResult,
  RiskLevel,
} from "./types/context-analysis";

const levels: Record<RiskLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical",
};

function App() {
  const [context, setContext] = useState("");
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<ContextAnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await analyzeContext({
          context,
          ...(transcript.trim() ? { transcript } : {}),
        }),
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Analysis failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="wordmark" href="/" aria-label="VeriVoice AI home">
          <span className="wordmark-icon" aria-hidden="true">V</span>
          <span>VeriVoice <strong>AI</strong></span>
        </a>
        <span className="header-tag">COMMUNICATION SAFETY</span>
      </header>

      <section className="intro">
        <p className="eyebrow">CONTEXT REVIEW</p>
        <h1>Pause. Check the request.</h1>
        <p className="intro-copy">
          Review a sensitive request for common pressure and payment scam
          signals. Findings are transparent heuristics—not proof of fraud or
          voice identity.
        </p>
      </section>

      <div className="workspace">
        <form className="analysis-form" onSubmit={handleSubmit}>
          <label htmlFor="context">Call or message context</label>
          <p className="field-hint">
            Who contacted you, what they claim, and any relevant circumstances.
          </p>
          <textarea
            id="context"
            required
            rows={5}
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="Example: Someone claiming to be our supplier called about an invoice..."
          />

          <label htmlFor="transcript">Transcript (optional)</label>
          <p className="field-hint">
            Include the exact words used when available.
          </p>
          <textarea
            id="transcript"
            rows={6}
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            placeholder="Example: Please wire the funds immediately to our new account..."
          />

          <button type="submit" disabled={loading || !context.trim()}>
            {loading ? "Reviewing request…" : "Analyze communication"}
          </button>
          {error && <p className="error-message" role="alert">{error}</p>}
        </form>

        <section className="results" aria-live="polite" aria-busy={loading}>
          {!result && !loading && (
            <div className="empty-state">
              <span className="empty-mark" aria-hidden="true">◎</span>
              <h2>Your review will appear here</h2>
              <p>Enter the context of a sensitive request to see its findings and recommended next steps.</p>
            </div>
          )}
          {loading && <p className="loading-state">Checking for risk signals…</p>}
          {result && (
            <div className="result-content">
              <div className={`risk-summary risk-${result.level}`}>
                <div>
                  <p className="eyebrow">HEURISTIC RISK LEVEL</p>
                  <h2>{levels[result.level]}</h2>
                </div>
                <p className="score"><strong>{result.score}</strong><span>/ 100</span></p>
              </div>

              <section className="result-section">
                <h3>Findings <span>{result.findings.length}</span></h3>
                {result.findings.length === 0 ? (
                  <p className="no-findings">No configured risk signals were detected. This does not establish that the request is safe.</p>
                ) : (
                  <ul className="finding-list">
                    {result.findings.map((finding) => (
                      <li key={finding.code} className="finding">
                        <div className="finding-heading">
                          <strong>{finding.title}</strong>
                          <span>+{finding.score}</span>
                        </div>
                        <code>{finding.code}</code>
                        <ul className="evidence-list">
                          {finding.evidence.map((evidence, index) => (
                            <li key={`${finding.code}-${index}`}>“{evidence}”</li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="result-section guidance-section">
                <h3>Recommended next steps</h3>
                <ul>
                  {result.guidance.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </section>
              <p className="disclaimer">
                This screening is a heuristic, not a calibrated probability.
                Independently verify requests using a known contact method.
              </p>
            </div>
          )}
        </section>
      </div>
      <footer>VeriVoice AI · Verify sensitive requests independently.</footer>
    </main>
  );
}

export default App;
