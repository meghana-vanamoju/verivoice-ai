import { useState } from "react";
import "./App.css";
import { AppHeader } from "./components/AppHeader";
import { ContextReview } from "./pages/ContextReview";
import { VoiceAnalysis } from "./pages/VoiceAnalysis";
import { useTheme } from "./hooks/useTheme";

type AppView = "voice" | "context";

export default function App() {
  const [view, setView] = useState<AppView>("voice");
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="app-root">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <AppHeader
        view={view}
        onSelectView={setView}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main id="main-content" className="app-main">
        {view === "voice" ? <VoiceAnalysis /> : <ContextReview />}
      </main>

      <footer className="app-footer">
        <p>
          VeriVoice AI · Heuristic screening assistance. Verify sensitive requests
          independently.
        </p>
      </footer>
    </div>
  );
}
