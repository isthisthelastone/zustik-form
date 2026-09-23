import assert from "node:assert/strict";
import test from "node:test";

import * as publicApi from "zustik-form";
import * as proxiedValibot from "zustik-form/valibot";
import * as directValibot from "valibot";

test("resolves the package self-reference through public ESM exports", () => {
  assert.equal(typeof publicApi.createZustikFormSlice, "function");
  assert.equal(publicApi.zustikFormCreate, undefined);
  assert.equal(publicApi.defineZustikForm, undefined);
  assert.equal(typeof publicApi.FORM_ERROR, "string");
});

test("re-exports the installed Valibot dependency through its public subpath", () => {
  assert.equal(proxiedValibot.object, directValibot.object);
  assert.equal(proxiedValibot.safeParse, directValibot.safeParse);
});
