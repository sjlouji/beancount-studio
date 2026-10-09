import { loader } from "@monaco-editor/react";

// Load Monaco from assets served by this app (copied by scripts/copy-monaco.mjs) instead of a CDN.
loader.config({ paths: { vs: "/monaco/vs" } });
