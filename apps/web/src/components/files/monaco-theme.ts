import type { Monaco } from "@monaco-editor/react";

export const THEME_LIGHT = "beancount-light";
export const THEME_DARK = "beancount-dark";

/*
 * Monaco cannot read CSS variables (oklch) for token colours, so the palette is
 * hex here and approximates the app tokens: the editor background is transparent
 * so the surrounding `bg-card` shows through in both themes.
 */
export function defineBeancountThemes(monaco: Monaco): void {
  monaco.editor.defineTheme(THEME_LIGHT, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "8a8578", fontStyle: "italic" },
      { token: "comment.heading", foreground: "6b665a", fontStyle: "bold" },
      { token: "number.date", foreground: "7a5c1e" },
      { token: "keyword", foreground: "8b3a62", fontStyle: "bold" },
      { token: "keyword.flag", foreground: "b4531f", fontStyle: "bold" },
      { token: "account", foreground: "1f5f5b" },
      { token: "number", foreground: "2c6e3f" },
      { token: "currency", foreground: "9a4d16" },
      { token: "string", foreground: "4a6a2a" },
      { token: "string.escape", foreground: "9a4d16" },
      { token: "tag", foreground: "5a4b9a" },
      { token: "link", foreground: "2b5f9e" },
      { token: "metadata.key", foreground: "7b7568" },
      { token: "delimiter", foreground: "7b7568" },
    ],
    colors: {
      "editor.background": "#00000000",
      "editorGutter.background": "#00000000",
      "editor.lineHighlightBackground": "#00000008",
      "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": "#a8a395",
      "editorLineNumber.activeForeground": "#4a463c",
      "editorCursor.foreground": "#1f5f5b",
      "editor.selectionBackground": "#1f5f5b2e",
      "editorIndentGuide.background1": "#0000000d",
    },
  });

  monaco.editor.defineTheme(THEME_DARK, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "7d786b", fontStyle: "italic" },
      { token: "comment.heading", foreground: "a39e8f", fontStyle: "bold" },
      { token: "number.date", foreground: "d9b46a" },
      { token: "keyword", foreground: "e58ab4", fontStyle: "bold" },
      { token: "keyword.flag", foreground: "f0a164", fontStyle: "bold" },
      { token: "account", foreground: "6fd0c8" },
      { token: "number", foreground: "8fd19e" },
      { token: "currency", foreground: "e8a46b" },
      { token: "string", foreground: "b4d68a" },
      { token: "string.escape", foreground: "e8a46b" },
      { token: "tag", foreground: "b4a6f0" },
      { token: "link", foreground: "8cb9f0" },
      { token: "metadata.key", foreground: "9a9486" },
      { token: "delimiter", foreground: "9a9486" },
    ],
    colors: {
      "editor.background": "#00000000",
      "editorGutter.background": "#00000000",
      "editor.lineHighlightBackground": "#ffffff0a",
      "editor.lineHighlightBorder": "#00000000",
      "editorLineNumber.foreground": "#5f5b50",
      "editorLineNumber.activeForeground": "#b5b09f",
      "editorCursor.foreground": "#6fd0c8",
      "editor.selectionBackground": "#6fd0c833",
      "editorIndentGuide.background1": "#ffffff0d",
    },
  });
}
