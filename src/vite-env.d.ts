/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Route to show when the URL has no hash, for builds that open on a given page. */
  readonly VITE_DEFAULT_ROUTE?: string;
}
