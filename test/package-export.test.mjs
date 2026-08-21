import assert from "node:assert/strict";
import test from "node:test";

import * as publicApi from "zustik-form";

test("resolves the package self-reference through public ESM exports", () => {
  assert.equal(typeof publicApi.createZustikFormSlice, "function");
  assert.equal(publicApi.zustikFormCreate, undefined);
  assert.equal(publicApi.defineZustikForm, undefined);
  assert.equal(typeof publicApi.FORM_ERROR, "string");
});
