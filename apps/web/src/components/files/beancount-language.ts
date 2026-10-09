import type { Monaco } from "@monaco-editor/react";
import type { languages } from "monaco-editor";
import { defineBeancountThemes } from "./monaco-theme";

export const BEANCOUNT_LANGUAGE_ID = "beancount";

const DIRECTIVES = ["open", "close", "balance", "pad", "note", "document", "event", "price", "commodity", "custom", "query", "option", "plugin", "include", "pushtag", "poptag", "txn"];

const tokenizer: languages.IMonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".beancount",
  directives: DIRECTIVES,
  tokenizer: {
    root: [
      // org-mode style section headings and ordinary comments
      [/^\*.*$/, "comment.heading"],
      [/;.*$/, "comment"],
      // posting / directive metadata keys: indented `key:`
      [/^\s+[a-z][a-z0-9_-]*:/, "metadata.key"],
      [/\d{4}-\d{2}-\d{2}/, "number.date"],
      [/"/, { token: "string", next: "@string" }],
      [/#[A-Za-z0-9\-_/.]+/, "tag"],
      [/\^[A-Za-z0-9\-_/.]+/, "link"],
      [/[A-Z][A-Za-z0-9-]*(?::[A-Z0-9][A-Za-z0-9-]*)+/, "account"],
      [/[a-z][a-z_]*/, { cases: { "@directives": "keyword", "@default": "identifier" } }],
      [/[*!]/, "keyword.flag"],
      [/-?\d[\d,]*(?:\.\d+)?/, "number"],
      [/[A-Z][A-Z0-9'._-]*/, "currency"],
      [/[{}@()]/, "delimiter"],
    ],
    string: [
      [/[^\\"]+/, "string"],
      [/\\./, "string.escape"],
      [/"/, { token: "string", next: "@pop" }],
    ],
  },
};

let registered = false;

/** Registers the Beancount language and both Monaco themes exactly once per page load. */
export function registerBeancount(monaco: Monaco): void {
  if (registered) return;
  registered = true;
  monaco.languages.register({ id: BEANCOUNT_LANGUAGE_ID, extensions: [".bean", ".beancount"], aliases: ["Beancount"] });
  monaco.languages.setMonarchTokensProvider(BEANCOUNT_LANGUAGE_ID, tokenizer);
  monaco.languages.setLanguageConfiguration(BEANCOUNT_LANGUAGE_ID, {
    comments: { lineComment: ";" },
    brackets: [["{", "}"], ["(", ")"]],
    autoClosingPairs: [
      { open: '"', close: '"', notIn: ["string"] },
      { open: "{", close: "}" },
      { open: "(", close: ")" },
    ],
    surroundingPairs: [
      { open: '"', close: '"' },
      { open: "{", close: "}" },
      { open: "(", close: ")" },
    ],
  });
  defineBeancountThemes(monaco);
}

export function languageForPath(path: string): string {
  if (/\.(bean|beancount)$/i.test(path)) return BEANCOUNT_LANGUAGE_ID;
  if (/\.json$/i.test(path)) return "json";
  if (/\.(md|markdown)$/i.test(path)) return "markdown";
  if (/\.ya?ml$/i.test(path)) return "yaml";
  if (/\.csv$/i.test(path)) return "plaintext";
  return "plaintext";
}

export function isBeancountPath(path: string): boolean {
  return /\.(bean|beancount)$/i.test(path);
}
