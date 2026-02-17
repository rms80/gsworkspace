/// <reference types="vite/client" />

declare const __PROJECT_ROOT__: string

interface ImportMetaEnv {
  readonly VITE_OFFLINE_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
