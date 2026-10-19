import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { challengeFor, createSignInChallenge, isAuthPage, parseSignedInDeepLink, signInUrl } from "./sign-in";

describe("createSignInChallenge", () => {
  it("produces a random verifier and its sha256 hex", () => {
    const a = createSignInChallenge();
    const b = createSignInChallenge();
    assert.ok(a.verifier.length >= 40);
    assert.match(a.challenge, /^[0-9a-f]{64}$/);
    assert.equal(challengeFor(a.verifier), a.challenge);
    assert.notEqual(a.verifier, b.verifier);
  });
});

describe("signInUrl", () => {
  it("points at the server's desktop sign-in page with the challenge", () => {
    const url = signInUrl("https://localhost:8443", "ab".repeat(32), false);
    assert.equal(url, `https://localhost:8443/desktop/sign-in?challenge=${"ab".repeat(32)}`);
  });

  it("asks for a deep link back only when the shell can receive one", () => {
    assert.ok(signInUrl("https://s.example", "ab".repeat(32), true).endsWith("&deeplink=1"));
  });
});

describe("parseSignedInDeepLink", () => {
  const challenge = "cd".repeat(32);

  it("extracts the challenge from the signed-in link", () => {
    assert.equal(parseSignedInDeepLink(`beancount-studio://signed-in?challenge=${challenge}`), challenge);
  });

  it("rejects other schemes, hosts and malformed challenges", () => {
    assert.equal(parseSignedInDeepLink(`https://signed-in?challenge=${challenge}`), null);
    assert.equal(parseSignedInDeepLink(`beancount-studio://other?challenge=${challenge}`), null);
    assert.equal(parseSignedInDeepLink("beancount-studio://signed-in?challenge=xyz"), null);
    assert.equal(parseSignedInDeepLink("not a url"), null);
  });
});

describe("isAuthPage", () => {
  const origin = "https://localhost:8443";

  it("matches the server's sign-in pages, with or without a query", () => {
    assert.equal(isAuthPage(`${origin}/login`, origin), true);
    assert.equal(isAuthPage(`${origin}/login?next=%2Fledgers`, origin), true);
    assert.equal(isAuthPage(`${origin}/sign-up`, origin), true);
  });

  it("ignores other pages and other origins", () => {
    assert.equal(isAuthPage(`${origin}/ledgers`, origin), false);
    assert.equal(isAuthPage("https://evil.example/login", origin), false);
    assert.equal(isAuthPage("garbage", origin), false);
  });
});
