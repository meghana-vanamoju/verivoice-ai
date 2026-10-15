import type {
  AnalysisResponse,
  DetectorStatus,
  Finding,
  RiskLevel,
} from "../types/analysis";

function confidenceLabel(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return `${Math.round(value * 100)}%`;
}

function riskTone(level: RiskLevel): string {
  switch (level) {
    case "high":
      return "risk-high";
    case "medium":
      return "risk-medium";
    default:
      return "risk-low";
  }
}

function formatOptionalNumber(value: number | null, suffix: string): string {
  if (value === null) return "Not provided";
  return suffix ? `${value} ${suffix}` : String(value);
}

interface ResultsProps {
  result: AnalysisResponse;
  onNewAnalysis: () => void;
}

export function ResultsDashboard({ result, onNewAnalysis }: ResultsProps) {
  const detection = result.audio.deepfake_detection;
  const labelDisplay = detection.label ?? "unknown";

  return (
    <section className="results" aria-labelledby="results-heading">
      <header className="results-header">
        <div className="results-title">
          <span className="card-icon" aria-hidden="true">
            <ChartGlyph />
          </span>
          <h2 id="results-heading">Analysis results</h2>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onNewAnalysis}>
          New analysis
        </button>
      </header>

      <p className="analysis-ref">
        Analysis reference: <code>{result.analysis_id}</code>
      </p>

      <div className={`card risk-card ${riskTone(result.risk.level)}`}>
        <div className="risk-score">
          <span className="risk-score-value">{result.risk.score}</span>
          <span className="risk-score-total">/ 100</span>
        </div>
        <div className="risk-body">
          <p className="risk-level">
            Risk level: <strong>{result.risk.level.toUpperCase()}</strong>
          </p>
          <p className="risk-summary-text">{result.risk.summary}</p>
          <p className="risk-basis">
            Score basis: <code>{result.risk.basis}</code>
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-icon" aria-hidden="true">
            <WaveDocGlyph />
          </span>
          <h3>Audio validation</h3>
        </div>
        <dl className="meta-grid">
          <dt>Validated</dt>
          <dd>{result.audio.valid ? "Yes" : "No"}</dd>
          <dt>Format</dt>
          <dd>{result.audio.format || "Unknown"}</dd>
          <dt>Duration</dt>
          <dd>{formatOptionalNumber(result.audio.duration_sec, "s")}</dd>
          <dt>Sample rate</dt>
          <dd>{formatOptionalNumber(result.audio.sample_rate_hz, "Hz")}</dd>
          <dt>Channels</dt>
          <dd>{formatOptionalNumber(result.audio.channel_count, "")}</dd>
        </dl>
        {result.audio.warnings.length > 0 ? (
          <ul className="warning-list">
            {result.audio.warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No audio validation warnings.</p>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-icon" aria-hidden="true">
            <ShieldGlyph />
          </span>
          <h3>Voice authenticity status</h3>
        </div>
        <p className="detector-status">
          Detector status: <strong>{detection.status}</strong>
        </p>
        <p>Detector label: {labelDisplay}</p>
        {detection.score !== null ? (
          <p>Detector score: {detection.score}</p>
        ) : (
          <p className="muted">No detector score available.</p>
        )}
        <AuthenticityNote status={detection.status} />
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-icon" aria-hidden="true">
            <SearchGlyph />
          </span>
          <h3>Detected findings</h3>
        </div>
        {result.findings.length === 0 ? (
          <p className="muted">No findings were reported.</p>
        ) : (
          <ul className="findings-list">
            {result.findings.map((finding: Finding, index) => (
              <li key={`${finding.code}-${index}`} className="finding-item">
                <div className="finding-header">
                  <strong>{finding.title || finding.code}</strong>
                  <span className="finding-meta">
                    {finding.severity} · {finding.category}
                  </span>
                </div>
                <p className="finding-evidence">{finding.evidence}</p>
                <p className="finding-source">Source: {finding.source}</p>
                {confidenceLabel(finding.confidence) ? (
                  <p className="finding-confidence">
                    Confidence: {confidenceLabel(finding.confidence)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-icon" aria-hidden="true">
            <ChecklistGlyph />
          </span>
          <h3>Verification guidance</h3>
        </div>
        {result.verification_guidance ? (
          <>
            <p className="guidance-priority">
              Priority: {result.verification_guidance.priority}
            </p>
            <p>{result.verification_guidance.message}</p>
          </>
        ) : (
          <p className="muted">No verification recommendations were provided.</p>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-icon" aria-hidden="true">
            <AlertGlyph />
          </span>
          <h3>Limitations</h3>
        </div>
        <ul className="limitations-list">
          {result.limitations.map((limitation, index) => (
            <li key={index}>{limitation}</li>
          ))}
        </ul>
        <p className="limitation-callout">
          Contextual warning patterns do not prove that a voice is cloned.
        </p>
      </div>
    </section>
  );
}

function AuthenticityNote({ status }: { status: DetectorStatus }) {
  if (status === "not_configured") {
    return (
      <p className="limitation-callout">
        Authenticity has not been determined because no validated detector was run.
      </p>
    );
  }
  if (status === "failed") {
    return (
      <p className="limitation-callout">
        The voice authenticity detector did not complete successfully. Its result must not
        be treated as a negative finding.
      </p>
    );
  }
  return (
    <p className="muted">
      Detector completed. A completed technical result is not proof of identity or
      authenticity.
    </p>
  );
}

function ChartGlyph() {
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
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </svg>
  );
}

function WaveDocGlyph() {
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
      <path d="M4 12v-2M8 12V8M12 12V5M16 12v-4M20 12v-2" />
      <path d="M3 16h18" />
    </svg>
  );
}

function ShieldGlyph() {
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
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
      <path d="M9.5 12l1.8 1.8L15 10" />
    </svg>
  );
}

function SearchGlyph() {
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
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function ChecklistGlyph() {
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
      <path d="M4 6h10M4 12h10M4 18h7" />
      <path d="m18 7 2 2 3-3" transform="translate(-2 3)" />
    </svg>
  );
}

function AlertGlyph() {
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
      <path d="M12 4 3 20h18L12 4Z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  );
}
