/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OFFLINE_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
