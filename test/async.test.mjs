import assert from "node:assert/strict";
import test from "node:test";

import * as v from "valibot";
import { createStore } from "zustand/vanilla";

import {
  FORM_ERROR,
  defineZustikForm,
  zustikFormCreate,
} from "../dist/index.js";

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

function createManager() {
  const slice = zustikFormCreate();
  return createStore()((set, get, store) => slice(set, get, store));
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
  const store = createManager();
  store.getState().createForm(
    defineZustikForm({
      defaultValues: { value: "" },
      fields: [{ name: "value" }],
      formPostfix: "Async",
      onSubmit: () => undefined,
      validationSchema: schema,
    }),
  );

  store.getState().zustikFormAsync.form.change("value", "first");
  store.getState().zustikFormAsync.form.change("value", "second");
  assert.equal(store.getState().zustikFormAsync.form.validating, true);

  gates.get("second").resolve();
  await tick();
  gates.get("first").resolve();
  gates.get("").resolve();
  await tick();
  await tick();

  const form = store.getState().zustikFormAsync.form;
  assert.equal(form.values.value, "second");
  assert.equal(form.validating, false);
  assert.equal(form.valid, true);
  assert.equal(form.errors, undefined);
});

test("late validation from a destroyed generation cannot update its replacement", async () => {
  const gate = deferred();
  const asyncSchema = v.objectAsync({
    value: v.pipeAsync(
      v.string(),
      v.checkAsync(async () => {
        await gate.promise;
        return false;
      }, "Old error"),
    ),
  });
  const store = createManager();
  const oldDefinition = defineZustikForm({
    defaultValues: { value: "old" },
    fields: [{ name: "value" }],
    formPostfix: "Race",
    onSubmit: () => undefined,
    validationSchema: asyncSchema,
  });
  store.getState().createForm(oldDefinition);

  const replacement = defineZustikForm({
    defaultValues: { value: "new" },
    fields: [{ name: "value" }],
    formPostfix: "Race",
    onSubmit: () => undefined,
    validationSchema: v.object({ value: v.string() }),
  });
  store.getState().createForm(replacement, { replace: true });
  gate.resolve();
  await tick();
  await tick();

  const form = store.getState().zustikFormRace.form;
  assert.equal(form.values.value, "new");
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
  const store = createManager();
  store.getState().createForm(
    defineZustikForm({
      defaultValues: { value: "reset" },
      fields: [{ name: "value" }],
      formPostfix: "ValidationReset",
      onSubmit: () => undefined,
      validationSchema: schema,
    }),
  );

  store.getState().zustikFormValidationReset.form.change("value", "bad");
  const reset = store.getState().zustikFormValidationReset.form.reset();
  gates.get("reset").resolve();
  await reset;
  await tick();
  gates.get("bad").resolve();
  await tick();
  await tick();

  const form = store.getState().zustikFormValidationReset.form;
  assert.equal(form.values.value, "reset");
  assert.equal(form.validating, false);
  assert.equal(form.valid, true);
  assert.equal(form.errors, undefined);
});

test("pending submission settles harmlessly after replacement", async () => {
  const gate = deferred();
  let oldSubmitCalls = 0;
  const store = createManager();
  store.getState().createForm(
    defineZustikForm({
      defaultValues: { value: "ready" },
      fields: [{ name: "value" }],
      formPostfix: "SubmitRace",
      onSubmit: async () => {
        oldSubmitCalls += 1;
        await gate.promise;
      },
      validationSchema: v.object({ value: v.string() }),
    }),
  );

  const oldForm = store.getState().zustikFormSubmitRace.form;
  const pendingSubmit = oldForm.submit();
  assert.equal(
    store.getState().zustikFormSubmitRace.form.submitting,
    true,
  );
  await tick();
  assert.equal(oldSubmitCalls, 1);

  store.getState().createForm(
    defineZustikForm({
      defaultValues: { value: "replacement" },
      fields: [{ name: "value" }],
      formPostfix: "SubmitRace",
      onSubmit: () => undefined,
      validationSchema: v.object({ value: v.string() }),
    }),
    { replace: true },
  );
  gate.resolve();

  assert.deepEqual(await pendingSubmit, { status: "destroyed" });
  const current = store.getState().zustikFormSubmitRace.form;
  assert.equal(current.values.value, "replacement");
  assert.equal(current.submitting, false);
  assert.equal(current.submitSucceeded, false);
});

test("deduplicates concurrent public submissions", async () => {
  const gate = deferred();
  let submitCalls = 0;
  const store = createManager();
  store.getState().createForm(
    defineZustikForm({
      defaultValues: { value: "ready" },
      fields: [{ name: "value" }],
      formPostfix: "Concurrent",
      onSubmit: async () => {
        submitCalls += 1;
        await gate.promise;
      },
      validationSchema: v.object({ value: v.string() }),
    }),
  );

  const form = store.getState().zustikFormConcurrent.form;
  const first = form.submit();
  const second = form.submit();
  assert.equal(first, second);
  await tick();
  assert.equal(submitCalls, 1);

  gate.resolve();
  assert.deepEqual(await first, { status: "succeeded" });
  assert.deepEqual(await second, { status: "succeeded" });
});

test("reports the callback outcome when reset happens during submission", async () => {
  const gate = deferred();
  const store = createManager();
  store.getState().createForm(
    defineZustikForm({
      defaultValues: { value: "ready" },
      fields: [{ name: "value" }],
      formPostfix: "ResetDuringSubmit",
      onSubmit: async () => {
        await gate.promise;
      },
      validationSchema: v.object({ value: v.string() }),
    }),
  );

  const pending =
    store.getState().zustikFormResetDuringSubmit.form.submit();
  await tick();
  assert.equal(
    store.getState().zustikFormResetDuringSubmit.form.submitting,
    true,
  );
  await store.getState().zustikFormResetDuringSubmit.form.reset();
  gate.resolve();

  assert.deepEqual(await pending, { status: "succeeded" });
  const form = store.getState().zustikFormResetDuringSubmit.form;
  assert.equal(form.values.value, "ready");
  assert.equal(form.submitting, false);
});

test("submission errors resolve into form state while thrown failures reject", async () => {
  const store = createManager();
  store.getState().createForm(
    defineZustikForm({
      defaultValues: { email: "taken@example.com" },
      fields: [{ name: "email" }],
      formPostfix: "ServerError",
      onSubmit: () => ({ email: "Already registered" }),
      validationSchema: v.object({ email: v.string() }),
    }),
  );

  const result =
    await store.getState().zustikFormServerError.form.submit();
  assert.deepEqual(result, {
    errors: { email: "Already registered" },
    status: "submission-error",
  });
  assert.equal(
    store.getState().zustikFormServerError.form.fields[0].submitError,
    "Already registered",
  );

  store.getState().createForm(
    defineZustikForm({
      defaultValues: { value: "ok" },
      fields: [{ name: "value" }],
      formPostfix: "Thrown",
      onSubmit: () => {
        throw new Error("network down");
      },
      validationSchema: v.object({ value: v.string() }),
    }),
  );
  await assert.rejects(
    store.getState().zustikFormThrown.form.submit(),
    /network down/,
  );
  assert.equal(store.getState().zustikFormThrown.form.submitting, false);
});

test("async reset callbacks observe reset state and propagate failures", async () => {
  const gate = deferred();
  const store = createManager();
  store.getState().createForm(
    defineZustikForm({
      defaultValues: { value: "initial" },
      fields: [{ name: "value" }],
      formPostfix: "AsyncReset",
      onReset: async () => {
        assert.equal(
          store.getState().zustikFormAsyncReset.form.values.value,
          "initial",
        );
        await gate.promise;
        throw new Error("reset side effect failed");
      },
      onSubmit: () => undefined,
    }),
  );
  store.getState().zustikFormAsyncReset.form.change("value", "changed");

  const reset = store.getState().zustikFormAsyncReset.form.reset();
  assert.equal(
    store.getState().zustikFormAsyncReset.form.values.value,
    "initial",
  );
  gate.resolve();
  await assert.rejects(reset, /reset side effect failed/);
  assert.equal(
    store.getState().zustikFormAsyncReset.form.values.value,
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
  const store = createManager();
  store.getState().createForm(
    defineZustikForm({
      defaultValues: { value: "ready" },
      fields: [{ name: "value" }],
      formPostfix: "RejectedValidation",
      onSubmit: () => undefined,
      validationSchema: schema,
    }),
  );

  await tick();
  await tick();
  const form = store.getState().zustikFormRejectedValidation.form;
  assert.equal(form.validating, false);
  assert.equal(form.valid, false);
  assert.match(String(form.errors[FORM_ERROR]), /validator crashed/);
  assert.equal((await form.submit()).status, "invalid");
});
