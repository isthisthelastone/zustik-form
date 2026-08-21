import assert from "node:assert/strict";
import test from "node:test";

import * as v from "valibot";
import { createStore } from "zustand/vanilla";

import { FORM_ERROR, createZustikFormSlice } from "../dist/index.js";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createStaticStore(configuration) {
  const factory = createZustikFormSlice(configuration);
  return createStore()((set, get, api) => factory(set, get, api));
}

test("newest async Valibot validation wins when promises settle out of order", async () => {
  const gates = new Map([
    ["", deferred()],
    ["first", deferred()],
    ["second", deferred()],
  ]);
  const schema = v.objectAsync({
    value: v.pipeAsync(
      v.string(),
      v.checkAsync(async (value) => {
        await gates.get(value).promise;
        return value === "second";
      }, "Not the latest valid value"),
    ),
  });
  const store = createStaticStore({
    defaultValues: { value: "" },
    fields: { value: {} },
    formPostfix: "Async",
    onSubmit: () => undefined,
    validationSchema: schema,
  });

  store.getState().zustikFormAsync.setValue("value", "first");
  store.getState().zustikFormAsync.setValue("value", "second");
  assert.equal(store.getState().zustikFormAsync.validating, true);

  gates.get("second").resolve();
  await tick();
  gates.get("first").resolve();
  gates.get("").resolve();
  await tick();
  await tick();

  const form = store.getState().zustikFormAsync;
  assert.equal(form.values.value, "second");
  assert.equal(form.validating, false);
  assert.equal(form.valid, true);
  assert.equal(form.errors, undefined);
});

test("late validation cannot overwrite a reset generation", async () => {
  const gates = new Map([
    ["reset", deferred()],
    ["bad", deferred()],
  ]);
  const schema = v.objectAsync({
    value: v.pipeAsync(
      v.string(),
      v.checkAsync(async (value) => {
        await gates.get(value).promise;
        return value === "reset";
      }, "Old value is invalid"),
    ),
  });
  const store = createStaticStore({
    defaultValues: { value: "reset" },
    fields: { value: {} },
    formPostfix: "ValidationReset",
    onSubmit: () => undefined,
    validationSchema: schema,
  });

  store.getState().zustikFormValidationReset.setValue("value", "bad");
  const reset = store.getState().zustikFormValidationReset.reset();
  gates.get("reset").resolve();
  await reset;
  await tick();
  gates.get("bad").resolve();
  await tick();
  await tick();

  const form = store.getState().zustikFormValidationReset;
  assert.equal(form.values.value, "reset");
  assert.equal(form.validating, false);
  assert.equal(form.valid, true);
  assert.equal(form.errors, undefined);
});

test("deduplicates concurrent public submissions", async () => {
  const gate = deferred();
  let submitCalls = 0;
  const store = createStaticStore({
    defaultValues: { value: "ready" },
    fields: { value: {} },
    formPostfix: "Concurrent",
    onSubmit: async () => {
      submitCalls += 1;
      await gate.promise;
    },
    validationSchema: v.object({ value: v.string() }),
  });

  const form = store.getState().zustikFormConcurrent;
  const first = form.submit();
  const second = form.submit();
  assert.equal(first, second);
  await tick();
  assert.equal(submitCalls, 1);

  gate.resolve();
  assert.deepEqual(await first, { status: "succeeded" });
  assert.deepEqual(await second, { status: "succeeded" });
});

test("reports callback success when reset happens during submission", async () => {
  const gate = deferred();
  const store = createStaticStore({
    defaultValues: { value: "ready" },
    fields: { value: {} },
    formPostfix: "ResetDuringSubmit",
    onSubmit: async () => {
      await gate.promise;
    },
    validationSchema: v.object({ value: v.string() }),
  });

  const pending = store.getState().zustikFormResetDuringSubmit.submit();
  await tick();
  assert.equal(
    store.getState().zustikFormResetDuringSubmit.submitting,
    true,
  );
  await store.getState().zustikFormResetDuringSubmit.reset();
  gate.resolve();

  assert.deepEqual(await pending, { status: "succeeded" });
  const form = store.getState().zustikFormResetDuringSubmit;
  assert.equal(form.values.value, "ready");
  assert.equal(form.submitting, false);
});

test("submission errors resolve into form state while thrown failures reject", async () => {
  const errorStore = createStaticStore({
    defaultValues: { email: "taken@example.com" },
    fields: { email: {} },
    formPostfix: "ServerError",
    onSubmit: () => ({ email: "Already registered" }),
    validationSchema: v.object({ email: v.string() }),
  });

  const result = await errorStore.getState().zustikFormServerError.submit();
  assert.deepEqual(result, {
    errors: { email: "Already registered" },
    status: "submission-error",
  });
  assert.equal(
    errorStore.getState().zustikFormServerError.fields.email.submitError,
    "Already registered",
  );

  const thrownStore = createStaticStore({
    defaultValues: { value: "ok" },
    fields: { value: {} },
    formPostfix: "Thrown",
    onSubmit: () => {
      throw new Error("network down");
    },
    validationSchema: v.object({ value: v.string() }),
  });
  await assert.rejects(
    thrownStore.getState().zustikFormThrown.submit(),
    /network down/,
  );
  assert.equal(thrownStore.getState().zustikFormThrown.submitting, false);
});

test("async reset callbacks observe reset state and propagate failures", async () => {
  const gate = deferred();
  let store;
  store = createStaticStore({
    defaultValues: { value: "initial" },
    fields: { value: {} },
    formPostfix: "AsyncReset",
    onReset: async () => {
      assert.equal(
        store.getState().zustikFormAsyncReset.values.value,
        "initial",
      );
      await gate.promise;
      throw new Error("reset side effect failed");
    },
    onSubmit: () => undefined,
  });
  store.getState().zustikFormAsyncReset.setValue("value", "changed");

  const reset = store.getState().zustikFormAsyncReset.reset();
  assert.equal(
    store.getState().zustikFormAsyncReset.values.value,
    "initial",
  );
  gate.resolve();
  await assert.rejects(reset, /reset side effect failed/);
  assert.equal(
    store.getState().zustikFormAsyncReset.values.value,
    "initial",
  );
});

test("turns rejected schema execution into a settled form-level error", async () => {
  const schema = v.objectAsync({
    value: v.pipeAsync(
      v.string(),
      v.checkAsync(async () => {
        throw new Error("validator crashed");
      }),
    ),
  });
  const store = createStaticStore({
    defaultValues: { value: "ready" },
    fields: { value: {} },
    formPostfix: "RejectedValidation",
    onSubmit: () => undefined,
    validationSchema: schema,
  });

  await tick();
  await tick();
  const form = store.getState().zustikFormRejectedValidation;
  assert.equal(form.validating, false);
  assert.equal(form.valid, false);
  assert.match(String(form.errors[FORM_ERROR]), /validator crashed/);
  assert.equal((await form.submit()).status, "invalid");
});
