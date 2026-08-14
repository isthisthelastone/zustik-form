import assert from "node:assert/strict";
import test from "node:test";

import { isValidElement } from "react";
import * as v from "valibot";
import { createStore } from "zustand/vanilla";

import {
  FORM_ERROR,
  defineZustikForm,
  zustikFormCreate,
} from "../dist/index.js";

function createManager(actionPostfix) {
  const slice =
    actionPostfix === undefined
      ? zustikFormCreate()
      : zustikFormCreate(actionPostfix);
  return createStore()((set, get, store) => ({
    ...slice(set, get, store),
    unrelated: 42,
  }));
}

function TextField() {
  throw new Error("createElement must not execute the component");
}

function makeCommentDefinition(overrides = {}) {
  const schema = v.object({
    comment: v.pipe(
      v.string(),
      v.minLength(2, "Comment is too short"),
      v.transform((value) => value.toUpperCase()),
    ),
    profile: v.object({
      displayName: v.pipe(v.string(), v.minLength(1, "Name is required")),
    }),
  });

  return defineZustikForm({
    defaultValues: { comment: "", profile: { displayName: "" } },
    fields: [
      {
        component: TextField,
        componentProps: { fullWidth: true },
        name: "comment",
      },
      { name: "profile.displayName" },
    ],
    formPostfix: "Comment",
    onSubmit: () => undefined,
    validationSchema: schema,
    ...overrides,
  });
}

test("creates an isolated Final Form view-model and React element snapshot", () => {
  const store = createManager();
  const definition = makeCommentDefinition();

  const created = store.getState().createForm(definition);
  const slot = store.getState().zustikFormComment;

  assert.equal(slot, created);
  assert.equal(store.getState().unrelated, 42);
  assert.equal(slot.form.formPostfix, "Comment");
  assert.match(slot.form.formId, /^zustik-Comment-\d+$/);
  assert.deepEqual(slot.form.values, {
    comment: "",
    profile: { displayName: "" },
  });
  assert.equal(slot.form.valid, false);
  assert.equal(slot.form.errors.comment, "Comment is too short");
  assert.equal(slot.form.errors.profile.displayName, "Name is required");
  assert.equal(slot.form.fields.length, 2);
  assert.equal(slot.form.components.length, 1);
  assert.equal(slot.form.fieldsByName.comment, slot.form.fields[0]);
  assert.equal(
    slot.form.fieldsByName["profile.displayName"],
    slot.form.fields[1],
  );

  const element = slot.form.components[0];
  assert.equal(isValidElement(element), true);
  assert.equal(element.type, TextField);
  assert.equal(element.key, "comment");
  assert.equal(element.props.name, "comment");
  assert.equal(element.props.value, "");
  assert.equal(element.props.fullWidth, true);
});

test("component callbacks update Final Form first and preserve old snapshots", () => {
  const observations = [];
  let store;
  const definition = makeCommentDefinition({
    fields: [
      {
        component: TextField,
        componentProps: {
          fullWidth: true,
          onBlur: () => {
            observations.push([
              "blur",
              store.getState().zustikFormComment.form.fields[0].touched,
            ]);
          },
          onChange: () => {
            observations.push([
              "change",
              store.getState().zustikFormComment.form.values.comment,
            ]);
          },
        },
        name: "comment",
      },
      { name: "profile.displayName" },
    ],
  });
  store = createManager();
  store.getState().createForm(definition);

  const oldElement = store.getState().zustikFormComment.form.components[0];
  oldElement.props.onChange({ currentTarget: { value: "hello" } });

  const current = store.getState().zustikFormComment.form;
  assert.equal(current.values.comment, "hello");
  assert.equal(current.components[0].props.value, "hello");
  assert.equal(oldElement.props.value, "");
  assert.deepEqual(observations[0], ["change", "hello"]);

  current.components[0].props.onFocus({});
  store
    .getState()
    .zustikFormComment.form.components[0].props.onBlur({ kind: "blur" });
  assert.equal(
    store.getState().zustikFormComment.form.fields[0].touched,
    true,
  );
  assert.deepEqual(observations[1], ["blur", true]);
});

test("submits Valibot output while retaining input values in state", async () => {
  const submitted = [];
  const store = createManager();
  store.getState().createForm(
    makeCommentDefinition({
      onSubmit: (values, context) => {
        submitted.push({ values, inputValues: context.inputValues });
      },
    }),
  );

  const invalidResult =
    await store.getState().zustikFormComment.form.submit();
  assert.equal(invalidResult.status, "invalid");
  assert.equal(submitted.length, 0);

  let form = store.getState().zustikFormComment.form;
  form.change("comment", "hello");
  form = store.getState().zustikFormComment.form;
  form.change("profile.displayName", "Ada");

  const result = await store.getState().zustikFormComment.form.submit();
  assert.deepEqual(result, { status: "succeeded" });
  assert.equal(submitted.length, 1);
  assert.deepEqual(submitted[0].values, {
    comment: "HELLO",
    profile: { displayName: "Ada" },
  });
  assert.deepEqual(submitted[0].inputValues, {
    comment: "hello",
    profile: { displayName: "Ada" },
  });
  assert.equal(
    store.getState().zustikFormComment.form.values.comment,
    "hello",
  );
});

test("reset commits the default snapshot before invoking the additional action", async () => {
  const trace = [];
  let store;
  const definition = makeCommentDefinition({
    onReset: (context) => {
      const form = store.getState().zustikFormComment.form;
      trace.push({
        initial: context.initialValues.comment,
        previous: context.previousValues.comment,
        touched: form.fields[0].touched,
        value: form.values.comment,
      });
    },
  });
  store = createManager();
  store.getState().createForm(definition);

  let form = store.getState().zustikFormComment.form;
  form.change("comment", "changed");
  form.fields[0].onFocus();
  store.getState().zustikFormComment.form.fields[0].onBlur();

  let prevented = false;
  await store.getState().zustikFormComment.form.onReset({
    preventDefault: () => {
      prevented = true;
    },
  });

  form = store.getState().zustikFormComment.form;
  assert.equal(prevented, true);
  assert.equal(form.values.comment, "");
  assert.equal(form.pristine, true);
  assert.equal(form.fields[0].touched, false);
  assert.deepEqual(trace, [
    { initial: "", previous: "changed", touched: false, value: "" },
  ]);
});

test("duplicate, replacement, destruction, and stale handles are generation-safe", async () => {
  const store = createManager();
  const original = makeCommentDefinition();
  store.getState().createForm(original);

  assert.throws(
    () => store.getState().createForm(original),
    /already exists/,
  );

  const staleForm = store.getState().zustikFormComment.form;
  const replacement = makeCommentDefinition({
    defaultValues: {
      comment: "replacement",
      profile: { displayName: "Ready" },
    },
  });
  store.getState().createForm(replacement, { replace: true });
  assert.equal(
    store.getState().zustikFormComment.form.values.comment,
    "replacement",
  );

  staleForm.change("comment", "stale write");
  assert.equal(
    store.getState().zustikFormComment.form.values.comment,
    "replacement",
  );
  assert.deepEqual(await staleForm.submit(), { status: "destroyed" });

  assert.equal(store.getState().destroyForm("Comment"), true);
  assert.equal(store.getState().zustikFormComment, undefined);
  assert.equal(store.getState().destroyForm("Comment"), false);
  assert.deepEqual(
    await replacement.onSubmit?.(),
    undefined,
  );
});

test("raw Final Form escape hatch projects changes and stores stay isolated", () => {
  const first = createManager();
  const second = createManager();
  const definition = makeCommentDefinition();
  first.getState().createForm(definition);
  second.getState().createForm(definition);

  const api = first.getState().getFormApi("Comment");
  api.change("comment", "first only");

  assert.equal(
    first.getState().zustikFormComment.form.values.comment,
    "first only",
  );
  assert.equal(second.getState().zustikFormComment.form.values.comment, "");

  first.getState().disposeForms();
  assert.equal(first.getState().hasForm("Comment"), false);
  assert.equal(first.getState().zustikFormComment, undefined);
  assert.equal(second.getState().hasForm("Comment"), true);
});

test("supports action postfixes without lifecycle helpers", () => {
  const store = createManager("Admin");
  assert.equal(typeof store.getState().createFormAdmin, "function");
  assert.equal(store.getState().createForm, undefined);

  store.getState().createFormAdmin(makeCommentDefinition());
  assert.equal(store.getState().hasFormAdmin("Comment"), true);
  assert.equal(store.getState().zustikFormComment.form.formPostfix, "Comment");
  assert.equal(store.getState().destroyFormAdmin("Comment"), true);
});

test("accepts caller IDs, generates IDs, and rejects cross-form ID collisions", () => {
  const store = createManager();
  const fieldsDefinition = defineZustikForm({
    defaultValues: { name: "" },
    fields: [{ name: "name" }],
    formId: "grocery-fields-form",
    formPostfix: "groceryFields",
    onSubmit: () => undefined,
  });
  const slot = store.getState().createForm(fieldsDefinition);
  assert.equal(slot.form.formId, "grocery-fields-form");
  assert.equal(
    store.getState().zustikFormgroceryFields.form.formId,
    "grocery-fields-form",
  );

  assert.throws(
    () =>
      store.getState().createForm(
        defineZustikForm({
          defaultValues: { name: "" },
          fields: [{ name: "name" }],
          formId: "grocery-fields-form",
          formPostfix: "groceryComponents",
          onSubmit: () => undefined,
        }),
      ),
    /already used/,
  );
  assert.equal(store.getState().zustikFormgroceryComponents, undefined);
});

test("supports custom component prop mapping and form-level validation errors", () => {
  function Checkbox() {
    return null;
  }

  const store = createManager();
  const schema = v.pipe(
    v.object({ accepted: v.boolean() }),
    v.check((values) => values.accepted, "You must accept"),
  );
  store.getState().createForm(
    defineZustikForm({
      defaultValues: { accepted: false },
      fields: [
        {
          component: Checkbox,
          componentProps: { color: "primary" },
          mapComponentProps: ({ componentProps, field, input }) => ({
            ...componentProps,
            checked: field.value,
            name: field.name,
            onChange: (event) => input.onChange(event.currentTarget.checked),
          }),
          name: "accepted",
        },
      ],
      formPostfix: "Terms",
      onSubmit: () => undefined,
      validationSchema: schema,
    }),
  );

  let form = store.getState().zustikFormTerms.form;
  assert.equal(form.errors[FORM_ERROR], "You must accept");
  assert.equal(form.components[0].props.checked, false);
  form.components[0].props.onChange({ currentTarget: { checked: true } });
  form = store.getState().zustikFormTerms.form;
  assert.equal(form.values.accepted, true);
  assert.equal(form.valid, true);
  assert.equal(form.components[0].props.checked, true);
});

test("rejects invalid postfixes and duplicate field names before changing state", () => {
  const store = createManager();
  assert.throws(
    () =>
      store.getState().createForm({
        defaultValues: { value: "" },
        fields: [{ name: "value" }],
        formPostfix: "bad postfix",
        onSubmit: () => undefined,
      }),
    /identifier/,
  );
  assert.throws(
    () =>
      store.getState().createForm({
        defaultValues: { value: "" },
        fields: [{ name: "value" }, { name: "value" }],
        formPostfix: "Duplicate",
        onSubmit: () => undefined,
      }),
    /Duplicate field name/,
  );
  assert.equal(store.getState().zustikFormDuplicate, undefined);
});

test("deep-clones defaults and initialized values", () => {
  const defaults = { profile: { name: "Original" } };
  const definition = defineZustikForm({
    defaultValues: defaults,
    fields: [{ name: "profile.name" }],
    formPostfix: "Cloned",
    onSubmit: () => undefined,
  });
  defaults.profile.name = "Mutated before create";

  const store = createManager();
  store.getState().createForm(definition);
  assert.equal(
    store.getState().zustikFormCloned.form.values.profile.name,
    "Original",
  );

  definition.defaultValues.profile.name = "Mutated after create";
  assert.equal(
    store.getState().zustikFormCloned.form.values.profile.name,
    "Original",
  );

  const initialized = { profile: { name: "Initialized" } };
  store.getState().zustikFormCloned.form.initialize(initialized);
  initialized.profile.name = "Mutated externally";
  assert.equal(
    store.getState().zustikFormCloned.form.values.profile.name,
    "Initialized",
  );
});

test("requires structured-cloneable form values", () => {
  assert.throws(
    () =>
      defineZustikForm({
        defaultValues: {
          profile: { name: "Original" },
          transform: () => undefined,
        },
        fields: [{ name: "profile.name" }],
        formPostfix: "NonCloneable",
        onSubmit: () => undefined,
      }),
    /structured-cloneable/,
  );

  assert.throws(
    () =>
      defineZustikForm({
        cloneValues: (values) => ({ ...values }),
        defaultValues: { value: "" },
        fields: [{ name: "value" }],
        formPostfix: "CustomClone",
        onSubmit: () => undefined,
      }),
    /cloneValues is not supported/,
  );

  const store = createManager();
  store.getState().createForm({
    defaultValues: { value: "Original" },
    fields: [{ name: "value" }],
    formPostfix: "StructuredValues",
    onSubmit: () => undefined,
  });

  const form = store.getState().zustikFormStructuredValues.form;
  assert.throws(
    () =>
      form.initialize({
        transform: () => undefined,
        value: "Changed",
      }),
    /structured-cloneable/,
  );
  assert.equal(
    store.getState().zustikFormStructuredValues.form.values.value,
    "Original",
  );
});

test("preserves component collection references for unrelated field state", () => {
  const store = createManager();
  store.getState().createForm(makeCommentDefinition());

  const before = store.getState().zustikFormComment.form;
  before.change("profile.displayName", "Ada");
  const afterHeadlessChange = store.getState().zustikFormComment.form;

  assert.equal(afterHeadlessChange.components, before.components);
  assert.equal(afterHeadlessChange.projectionErrors, before.projectionErrors);
  assert.equal(afterHeadlessChange.components[0], before.components[0]);
  assert.equal(afterHeadlessChange.fields[0], before.fields[0]);
  assert.notEqual(afterHeadlessChange.fields[1], before.fields[1]);

  afterHeadlessChange.fields[0].onFocus();
  const afterFocus = store.getState().zustikFormComment.form;
  assert.equal(afterFocus.components, before.components);
  assert.equal(afterFocus.components[0], before.components[0]);
  assert.notEqual(afterFocus.fields[0], before.fields[0]);
});

test("publishes mapper failures without losing the latest engine values", () => {
  function MappedInput() {
    return null;
  }

  const store = createManager();
  store.getState().createForm(
    defineZustikForm({
      defaultValues: { value: "ready" },
      fields: [
        {
          component: MappedInput,
          componentProps: { label: "Mapped" },
          mapComponentProps: ({ componentProps, field, input }) => {
            if (field.value === "explode") throw new Error("mapper exploded");
            return {
              ...componentProps,
              name: field.name,
              onChange: (value) => input.onChange(value),
              value: field.value,
            };
          },
          name: "value",
        },
      ],
      formPostfix: "Projection",
      onSubmit: () => undefined,
    }),
  );

  const initialElement =
    store.getState().zustikFormProjection.form.components[0];
  assert.doesNotThrow(() =>
    store.getState().zustikFormProjection.form.change("value", "explode"),
  );
  let form = store.getState().zustikFormProjection.form;
  assert.equal(form.values.value, "explode");
  assert.equal(form.hasProjectionErrors, true);
  assert.match(String(form.projectionErrors.value), /mapper exploded/);
  assert.equal(form.fieldsByName.value.projectionError.message, "mapper exploded");
  assert.equal(form.components[0], initialElement);
  assert.equal(form.components[0].props.value, "ready");

  form.change("value", "recovered");
  form = store.getState().zustikFormProjection.form;
  assert.equal(form.values.value, "recovered");
  assert.equal(form.hasProjectionErrors, false);
  assert.deepEqual({ ...form.projectionErrors }, {});
  assert.equal(form.fieldsByName.value.projectionError, undefined);
  assert.equal(form.components[0].props.value, "recovered");
});

test("rejects foreign undefined slots but lets an owner recreate tombstones", () => {
  const slice = zustikFormCreate();
  const store = createStore()((set, get, api) => ({
    ...slice(set, get, api),
    zustikFormReserved: undefined,
  }));
  const definition = defineZustikForm({
    defaultValues: { value: "" },
    fields: [{ name: "value" }],
    formPostfix: "Reserved",
    onSubmit: () => undefined,
  });

  assert.throws(() => store.getState().createForm(definition), /already used/);

  const owner = createManager();
  owner.getState().createForm(definition);
  assert.equal(owner.getState().destroyForm("Reserved"), true);
  assert.doesNotThrow(() => owner.getState().createForm(definition));
});

test("uses radio values and validates field definition paths", () => {
  function Radio() {
    return null;
  }

  const store = createManager();
  store.getState().createForm(
    defineZustikForm({
      defaultValues: { color: "blue" },
      fields: [{ component: Radio, name: "color" }],
      formPostfix: "Radio",
      onSubmit: () => undefined,
    }),
  );
  store.getState().zustikFormRadio.form.components[0].props.onChange({
    currentTarget: { checked: true, type: "radio", value: "red" },
  });
  assert.equal(store.getState().zustikFormRadio.form.values.color, "red");

  assert.throws(
    () =>
      defineZustikForm({
        defaultValues: { value: "" },
        fields: [{ name: "missing" }],
        formPostfix: "MissingDefault",
        onSubmit: () => undefined,
      }),
    /does not exist in defaultValues/,
  );
  assert.throws(
    () =>
      defineZustikForm({
        defaultValues: { value: "" },
        fields: [
          {
            component: Radio,
            controlledProps: ["checked"],
            name: "value",
          },
        ],
        formPostfix: "MissingMapper",
        onSubmit: () => undefined,
      }),
    /mapComponentProps is required/,
  );
});

test("projects field-specific array length metadata", () => {
  const store = createManager();
  store.getState().createForm(
    defineZustikForm({
      defaultValues: { tags: ["one"] },
      fields: [{ name: "tags" }],
      formPostfix: "Tags",
      onSubmit: () => undefined,
    }),
  );

  assert.equal(store.getState().zustikFormTags.form.fields[0].length, 1);
  store.getState().zustikFormTags.form.change("tags", ["one", "two"]);
  assert.equal(store.getState().zustikFormTags.form.fields[0].length, 2);
});
