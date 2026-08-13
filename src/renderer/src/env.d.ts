/// <reference types="vite/client" />

import type { ChoraApi } from '../../shared/contracts'

declare global {
  interface Window {
    api: ChoraApi
  }
}

export {}
