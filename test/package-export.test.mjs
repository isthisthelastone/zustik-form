import assert from "node:assert/strict";
import test from "node:test";

import * as publicApi from "zustik-form";

test("resolves the package self-reference through public ESM exports", () => {
  assert.equal(typeof publicApi.zustikFormCreate, "function");
  assert.equal(typeof publicApi.defineZustikForm, "function");
  assert.equal(typeof publicApi.defineZustikField, "function");
  assert.equal(typeof publicApi.FORM_ERROR, "string");
});
