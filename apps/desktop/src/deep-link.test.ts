import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isServerPath, parseOpenDeepLink } from "./deep-link";

describe("parseOpenDeepLink", () => {
  it("maps a workspace link onto the server's path, keeping query and fragment", () => {
    assert.equal(parseOpenDeepLink("beancount-studio://w/ada/books"), "/w/ada/books");
    assert.equal(parseOpenDeepLink("beancount-studio://w/ada/books/journal?time=2026#top"), "/w/ada/books/journal?time=2026#top");
    assert.equal(parseOpenDeepLink("beancount-studio://w/ada/settings"), "/w/ada/settings");
  });

  it("opens invites, onboarding, account settings and profiles", () => {
    assert.equal(parseOpenDeepLink("beancount-studio://invite/T9LNt_u3t5kCkm"), "/invite/T9LNt_u3t5kCkm");
    assert.equal(parseOpenDeepLink("beancount-studio://new"), "/new");
    assert.equal(parseOpenDeepLink("beancount-studio://settings/api-keys"), "/settings/api-keys");
    assert.equal(parseOpenDeepLink("beancount-studio://u/ada"), "/u/ada");
  });

  it("ignores the sign-in link, other roots, other schemes and credentials", () => {
    assert.equal(parseOpenDeepLink(`beancount-studio://signed-in?challenge=${"ab".repeat(32)}`), null);
    assert.equal(parseOpenDeepLink("beancount-studio://login"), null);
    assert.equal(parseOpenDeepLink("beancount-studio://api/auth/me"), null);
    assert.equal(parseOpenDeepLink("https://w/ada/books"), null);
    assert.equal(parseOpenDeepLink("beancount-studio://user:pw@w/ada"), null);
    assert.equal(parseOpenDeepLink("beancount-studio://w:8080/ada"), null);
    assert.equal(parseOpenDeepLink("not a url"), null);
  });
});

describe("isServerPath", () => {
  it("accepts absolute paths and rejects scheme-relative ones", () => {
    assert.equal(isServerPath("/w/ada"), true);
    assert.equal(isServerPath("/"), true);
    assert.equal(isServerPath("//evil.example/x"), false);
    assert.equal(isServerPath("/\\evil.example"), false);
    assert.equal(isServerPath("w/ada"), false);
    assert.equal(isServerPath("https://evil.example"), false);
  });
});
