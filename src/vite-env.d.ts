/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Route to show when the URL has no hash, for builds that open on a given page. */
  readonly VITE_DEFAULT_ROUTE?: string;
  /** "http" to use a running gateway at /api; otherwise the gateway runs inside the page (preview). */
  readonly VITE_GATEWAY?: string;
}
