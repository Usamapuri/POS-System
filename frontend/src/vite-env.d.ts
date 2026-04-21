/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  /** Set to `"true"` on production deploys to hide demo account shortcuts. */
  readonly VITE_HIDE_DEMO_LOGINS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
