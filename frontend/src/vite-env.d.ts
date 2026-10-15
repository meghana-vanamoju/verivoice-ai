// Explicit typing for the API base URL consumed by the data services.
// VITE_API_BASE_URL is replaced statically by Vite; it is intentionally not
// declared `readonly` so tests can override it at runtime (matching the loose
// shape of Vite's own ImportMetaEnv).
interface ImportMetaEnv {
  VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
