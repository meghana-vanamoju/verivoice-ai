import type {
  AnalysisResponse,
  DetectorStatus,
  Finding,
  RiskLevel,
  VerificationGuidance,
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

interface ResultsProps {
  result: AnalysisResponse;
  onNewAnalysis: () => void;
}

export function ResultsDashboard({ result, onNewAnalysis }: ResultsProps) {
  return (
    <section className="results" aria-labelledby="results-heading">
      <header className="results-header">
        <h2 id="results-heading">Analysis results</h2>
        <button type="button" className="secondary-button" onClick={onNewAnalysis}>
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
          <p className="risk-summary">{result.risk.summary}</p>
          <p className="risk-basis">
            Score basis: <code>{result.risk.basis}</code>
          </p>
        </div>
      </div>

      <div className="card">
        <h3>Audio validation</h3>
        <dl className="meta-grid">
          <dt>Validated</dt>
          <dd>{result.audio.valid ? "Yes" : "No"}</dd>
          <dt>Format</dt>
          <dd>{result.audio.format || "Unknown"}</dd>
          <dt>Duration</dt>
          <dd>
            {result.audio.duration_seconds === null
              ? "Not provided"
              : `${result.audio.duration_seconds} s`}
          </dd>
          <dt>Sample rate</dt>
          <dd>
            {result.audio.sample_rate_hz === null
              ? "Not provided"
              : `${result.audio.sample_rate_hz} Hz`}
          </dd>
          <dt>Channels</dt>
          <dd>{result.audio.channels === null ? "Not provided" : result.audio.channels}</dd>
        </dl>
        {result.audio.validation_warnings.length > 0 ? (
          <ul className="warning-list">
            {result.audio.validation_warnings.map((warning, index) => (
              <li key={index}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">No audio validation warnings.</p>
        )}
      </div>

      <div className="card">
        <h3>Voice authenticity status</h3>
        <p className="detector-status">
          Detector status: <strong>{result.audio.deepfake_detection.status}</strong>
        </p>
        <p>Detector label: {result.audio.deepfake_detection.label}</p>
        {result.audio.deepfake_detection.score !== null ? (
          <p>Detector score: {result.audio.deepfake_detection.score}</p>
        ) : (
          <p className="muted">No detector score available.</p>
        )}
        <AuthenticityNote status={result.audio.deepfake_detection.status} />
      </div>

      <div className="card">
        <h3>Detected findings</h3>
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
        <h3>Verification guidance</h3>
        {result.verification_guidance.length === 0 ? (
          <p className="muted">No verification recommendations were provided.</p>
        ) : (
          <ul className="guidance-list">
            {result.verification_guidance.map((item: VerificationGuidance, index) => (
              <li key={`${item.code}-${index}`}>
                <p className="guidance-priority">Priority: {item.priority}</p>
                <p>{item.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>Limitations</h3>
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
