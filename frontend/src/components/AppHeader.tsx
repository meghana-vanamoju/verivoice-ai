import type { Theme } from "../theme";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  view: "voice" | "context";
  onSelectView: (view: "voice" | "context") => void;
  theme: Theme;
  onToggleTheme: () => void;
}

const TABS: { id: "voice" | "context"; label: string }[] = [
  { id: "voice", label: "Voice analysis" },
  { id: "context", label: "Context review" },
];

/**
 * Shared masthead: brand identity, theme control, and the primary navigation.
 * Rendered once by App so both screens share the same header and navigation.
 */
export function AppHeader({ view, onSelectView, theme, onToggleTheme }: Props) {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <BrandGlyph />
          </span>
          <div className="brand-copy">
            <h1 className="brand-name">VeriVoice AI</h1>
            <p className="brand-subtitle">Voice Intelligence · Communication Safety</p>
          </div>
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>

      <nav className="app-nav" aria-label="Primary">
        <div className="app-nav-inner">
          {TABS.map((tab) => {
            const isActive = tab.id === view;
            return (
              <button
                key={tab.id}
                type="button"
                className={isActive ? "nav-tab nav-tab-active" : "nav-tab"}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onSelectView(tab.id)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

/** Compact waveform mark: audio signal inside a rounded security tile. */
function BrandGlyph() {
  return (
    <svg
      className="brand-glyph"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <line x1="4" y1="10" x2="4" y2="14" />
        <line x1="8" y1="7" x2="8" y2="17" />
        <line x1="12" y1="4" x2="12" y2="20" />
        <line x1="16" y1="7.5" x2="16" y2="16.5" />
        <line x1="20" y1="10" x2="20" y2="14" />
      </g>
    </svg>
  );
}
