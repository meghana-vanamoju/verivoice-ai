import { useState, type FormEvent } from "react";
import { analyzeContext } from "../services/context-analysis";
import type {
  ContextAnalysisResult,
  RiskLevel,
} from "../types/context-analysis";

const levels: Record<RiskLevel, string> = {
  low: "Low",
  moderate: "Moderate",
  high: "High",
  critical: "Critical",
};

export function ContextReview() {
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
    <section className="page context-review" aria-labelledby="context-title">
      <div className="page-head">
        <p className="eyebrow">Context review</p>
        <h2 className="page-title" id="context-title">
          Pause. Check the request.
        </h2>
        <p className="page-lede">
          Review a sensitive request for common pressure and payment scam signals.
          Findings are transparent heuristics — not proof of fraud or voice identity.
        </p>
      </div>

      <div className="context-grid">
        <form className="card context-form" onSubmit={handleSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="context">
              Call or message context
            </label>
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
          </div>

          <div className="field">
            <label className="field-label" htmlFor="transcript">
              Transcript (optional)
            </label>
            <p className="field-hint">Include the exact words used when available.</p>
            <textarea
              id="transcript"
              rows={6}
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder="Example: Please wire the funds immediately to our new account..."
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading || !context.trim()}
          >
            {loading ? "Reviewing request…" : "Analyze communication"}
          </button>
          {error ? (
            <p className="error-banner" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        <section className="card context-results" aria-live="polite" aria-busy={loading}>
          {!result && !loading ? (
            <div className="empty-state">
              <span className="empty-mark" aria-hidden="true">
                <RadarGlyph />
              </span>
              <h3>Your review will appear here</h3>
              <p>
                Enter the context of a sensitive request to see its findings and
                recommended next steps.
              </p>
            </div>
          ) : null}

          {loading ? (
            <p className="loading-state" role="status">
              <span className="spinner" aria-hidden="true" />
              Checking for risk signals…
            </p>
          ) : null}

          {result ? (
            <div className="result-content">
              <div className={`risk-summary risk-${result.level}`}>
                <div>
                  <p className="eyebrow">Heuristic risk level</p>
                  <h3>{levels[result.level]}</h3>
                </div>
                <p className="score">
                  <strong>{result.score}</strong>
                  <span>/ 100</span>
                </p>
              </div>

              <section className="result-section">
                <h3>
                  Findings <span>{result.findings.length}</span>
                </h3>
                {result.findings.length === 0 ? (
                  <p className="no-findings">
                    No configured risk signals were detected. This does not establish that
                    the request is safe.
                  </p>
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
                  {result.guidance.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>

              <p className="disclaimer">
                This screening is a heuristic, not a calibrated probability. Independently
                verify requests using a known contact method.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function RadarGlyph() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 12 18 6" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" />
    </svg>
  );
}
