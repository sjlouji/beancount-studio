import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { healthUrl, isOnServer, normalizeServerUrl, ServerUrlError } from "./server-url";

describe("normalizeServerUrl", () => {
  it("assumes https when no scheme is typed", () => {
    assert.equal(normalizeServerUrl("studio.example.com"), "https://studio.example.com");
  });

  it("uses plain http for localhost without a scheme", () => {
    assert.equal(normalizeServerUrl("localhost:3000"), "http://localhost:3000");
    assert.equal(normalizeServerUrl("127.0.0.1:8080"), "http://127.0.0.1:8080");
  });

  it("keeps an explicit scheme", () => {
    assert.equal(normalizeServerUrl("http://studio.example.com"), "http://studio.example.com");
    assert.equal(normalizeServerUrl("https://localhost:3000"), "https://localhost:3000");
  });

  it("reduces the address to its origin", () => {
    assert.equal(
      normalizeServerUrl("  https://user:pw@studio.example.com:8443/ledgers?x=1#top  "),
      "https://studio.example.com:8443",
    );
  });

  it("rejects empty input", () => {
    assert.throws(() => normalizeServerUrl("   "), ServerUrlError);
  });

  it("rejects non-http schemes", () => {
    assert.throws(() => normalizeServerUrl("ftp://studio.example.com"), ServerUrlError);
  });

  it("rejects unparseable input", () => {
    assert.throws(() => normalizeServerUrl("http://"), ServerUrlError);
  });
});

describe("isOnServer", () => {
  const origin = "https://studio.example.com";

  it("accepts any path on the same origin", () => {
    assert.equal(isOnServer("https://studio.example.com/ledgers/ada/personal", origin), true);
  });

  it("rejects other ports, schemes and hosts", () => {
    assert.equal(isOnServer("https://studio.example.com:8443/", origin), false);
    assert.equal(isOnServer("http://studio.example.com/", origin), false);
    assert.equal(isOnServer("https://evil.example.com/", origin), false);
  });

  it("rejects strings that are not URLs", () => {
    assert.equal(isOnServer("not a url", origin), false);
  });
});

describe("healthUrl", () => {
  it("points at the API health endpoint", () => {
    assert.equal(healthUrl("http://localhost:3000"), "http://localhost:3000/api/healthz");
  });
});
