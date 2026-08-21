import assert from "node:assert/strict";
import test from "node:test";

import { FORM_ERROR } from "final-form";
import * as v from "valibot";
import { createStore } from "zustand/vanilla";

import { createZustikFormSlice } from "../dist/index.js";

function TextInput() {
  return null;
}

function makeCommentFactory(overrides = {}) {
  return createZustikFormSlice({
    defaultValues: {
      comment: "",
      profile: { displayName: "" },
    },
    fields: {
      comment: {
        component: TextInput,
        props: { label: "Comment" },
      },
      "profile.displayName": {},
    },
    formId: "comment-form",
    formPostfix: "Comment",
    onSubmit: () => undefined,
    ...overrides,
  });
}

function createFormStore(factory, extraSlice) {
  return createStore()((set, get, api) => ({
    ...factory(set, get, api),
    ...(extraSlice?.(set, get, api) ?? {}),
  }));
}

test("creates one always-present static form slice with direct keyed views", () => {
  const createCommentFormSlice = makeCommentFactory();
  const store = createFormStore(createCommentFormSlice);
  const state = store.getState();
  const form = state.zustikFormComment;

  assert.equal(state.createForm, undefined);
  assert.equal(form.formId, "comment-form");
  assert.equal(form.formPostfix, "Comment");
  assert.equal(form.formProps.id, "comment-form");
  assert.equal(form.values.comment, "");
  assert.deepEqual(Object.keys(form.fields), [
    "comment",
    "profile.displayName",
  ]);
  assert.deepEqual(Object.keys(form.fieldProps), [
    "comment",
    "profile.displayName",
  ]);
  assert.deepEqual(Object.keys(form.components), ["comment"]);
  assert.equal(form.fields.comment.name, "comment");
  assert.equal(
    form.fields["profile.displayName"].name,
    "profile.displayName",
  );
  assert.equal(form.fieldProps.comment, form.components.comment.props);
  assert.equal(form.components.comment.type, TextInput);
  assert.equal(form.components.comment.key, "comment");
  assert.equal(form.components.comment.props.label, "Comment");
  assert.equal(form.components.comment.props.value, "");
  assert.equal(form.formProps.onReset, form.onReset);
  assert.equal(form.formProps.onSubmit, form.onSubmit);
  assert.equal(form.api.getState().values.comment, "");
});

test("component elements and fieldProps are fully bound at store creation", () => {
  const trace = [];
  let store;
  const createCommentFormSlice = makeCommentFactory({
    fields: {
      comment: {
        component: TextInput,
        props: {
          label: "Comment",
          onBlur: (event) => trace.push(["blur", event.kind]),
          onChange: () =>
            trace.push([
              "change",
              store.getState().zustikFormComment.values.comment,
            ]),
          onFocus: (event) => trace.push(["focus", event.kind]),
        },
      },
      "profile.displayName": {},
    },
  });
  store = createFormStore(createCommentFormSlice);

  const initial = store.getState().zustikFormComment;
  const oldElement = initial.components.comment;
  oldElement.props.onChange({ currentTarget: { value: "hello" } });

  let form = store.getState().zustikFormComment;
  assert.equal(form.values.comment, "hello");
  assert.equal(form.fieldProps.comment.value, "hello");
  assert.equal(form.components.comment.props.value, "hello");
  assert.notEqual(form.components.comment, oldElement);
  assert.deepEqual(trace, [["change", "hello"]]);

  form.components.comment.props.onFocus({ kind: "focus" });
  form = store.getState().zustikFormComment;
  assert.equal(form.active, "comment");
  form.components.comment.props.onBlur({ kind: "blur" });
  form = store.getState().zustikFormComment;
  assert.equal(form.fields.comment.touched, true);
  assert.deepEqual(trace, [
    ["change", "hello"],
    ["focus", "focus"],
    ["blur", "blur"],
  ]);
});

test("headless fieldProps can be spread directly and use event extraction", () => {
  const store = createFormStore(makeCommentFactory());
  let form = store.getState().zustikFormComment;
  const props = form.fieldProps["profile.displayName"];

  props.onChange({ currentTarget: { value: "Ada" } });
  form = store.getState().zustikFormComment;
  assert.equal(form.values.profile.displayName, "Ada");
  assert.equal(form.fieldProps["profile.displayName"].value, "Ada");

  form.setValue("profile.displayName", "Grace");
  assert.equal(
    store.getState().zustikFormComment.values.profile.displayName,
    "Grace",
  );
});

test("validates input, submits transformed output, and exposes formProps", async () => {
  const submitted = [];
  const schema = v.object({
    comment: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(2, "Too short"),
      v.transform((value) => value.length),
    ),
  });
  const factory = createZustikFormSlice({
    defaultValues: { comment: "" },
    fields: { comment: {} },
    formPostfix: "Validation",
    onSubmit: (values, context) => {
      submitted.push({
        formId: context.formId,
        input: context.inputValues.comment,
        output: values.comment,
      });
    },
    validationSchema: schema,
  });
  const store = createFormStore(factory);

  let prevented = false;
  let result = await store.getState().zustikFormValidation.formProps.onSubmit({
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(result.status, "invalid");
  assert.equal(
    store.getState().zustikFormValidation.fields.comment.error,
    "Too short",
  );

  store.getState().zustikFormValidation.setValue("comment", "  hello  ");
  result = await store.getState().zustikFormValidation.submit();
  assert.deepEqual(result, { status: "succeeded" });
  assert.deepEqual(submitted, [
    {
      formId: "zustik-Validation",
      input: "  hello  ",
      output: 5,
    },
  ]);
});

test("reset is immediate, event-safe, and runs the configured callback", async () => {
  const trace = [];
  let store;
  const factory = createZustikFormSlice({
    defaultValues: { value: "initial" },
    fields: { value: {} },
    formPostfix: "Resettable",
    onReset: ({ initialValues, previousValues }) => {
      trace.push({
        initial: initialValues.value,
        previous: previousValues.value,
        visible: store.getState().zustikFormResettable.values.value,
      });
    },
    onSubmit: () => undefined,
  });
  store = createFormStore(factory);
  store.getState().zustikFormResettable.setValue("value", "changed");
  store.getState().zustikFormResettable.fields.value.onFocus();
  store.getState().zustikFormResettable.fields.value.onBlur();

  let prevented = false;
  await store.getState().zustikFormResettable.formProps.onReset({
    preventDefault: () => {
      prevented = true;
    },
  });

  const form = store.getState().zustikFormResettable;
  assert.equal(prevented, true);
  assert.equal(form.values.value, "initial");
  assert.equal(form.pristine, true);
  assert.equal(form.fields.value.touched, false);
  assert.deepEqual(trace, [
    { initial: "initial", previous: "changed", visible: "initial" },
  ]);
});

test("multiple static form factories compose without a registry", () => {
  const createUserFormSlice = createZustikFormSlice({
    defaultValues: { name: "" },
    fields: { name: {} },
    formPostfix: "User",
    onSubmit: () => undefined,
  });
  const createProductFormSlice = createZustikFormSlice({
    defaultValues: { title: "" },
    fields: { title: {} },
    formPostfix: "Product",
    onSubmit: () => undefined,
  });

  const store = createStore()((set, get, api) => ({
    ...createUserFormSlice(set, get, api),
    ...createProductFormSlice(set, get, api),
    count: 0,
  }));
  store.getState().zustikFormUser.setValue("name", "Ada");

  assert.equal(store.getState().zustikFormUser.values.name, "Ada");
  assert.equal(store.getState().zustikFormProduct.values.title, "");
  assert.equal(store.getState().count, 0);
});

test("one static factory creates isolated runtimes for separate stores", () => {
  const factory = makeCommentFactory();
  const first = createFormStore(factory);
  const second = createFormStore(factory);

  first.getState().zustikFormComment.setValue("comment", "first only");
  assert.equal(first.getState().zustikFormComment.values.comment, "first only");
  assert.equal(second.getState().zustikFormComment.values.comment, "");

  first.getState().zustikFormComment.api.change("comment", "through api");
  assert.equal(first.getState().zustikFormComment.values.comment, "through api");
});

test("rejects duplicate static postfixes and form IDs in one store", () => {
  const first = createZustikFormSlice({
    defaultValues: { value: "" },
    fields: { value: {} },
    formId: "shared-id",
    formPostfix: "Duplicate",
    onSubmit: () => undefined,
  });
  const samePostfix = createZustikFormSlice({
    defaultValues: { value: "" },
    fields: { value: {} },
    formId: "other-id",
    formPostfix: "Duplicate",
    onSubmit: () => undefined,
  });
  assert.throws(
    () =>
      createStore()((set, get, api) => ({
        ...first(set, get, api),
        ...samePostfix(set, get, api),
      })),
    /already supplied/,
  );

  const sameId = createZustikFormSlice({
    defaultValues: { value: "" },
    fields: { value: {} },
    formId: "shared-id",
    formPostfix: "Other",
    onSubmit: () => undefined,
  });
  assert.throws(
    () =>
      createStore()((set, get, api) => ({
        ...first(set, get, api),
        ...sameId(set, get, api),
      })),
    /already used/,
  );
});

test("supports mapProps for non-standard controlled components", () => {
  function Checkbox() {
    return null;
  }

  const schema = v.pipe(
    v.object({ accepted: v.boolean() }),
    v.check((values) => values.accepted, "You must accept"),
  );
  const factory = createZustikFormSlice({
    defaultValues: { accepted: false },
    fields: {
      accepted: {
        component: Checkbox,
        mapProps: ({ field, input, props }) => ({
          checked: field.value,
          color: props.color,
          name: field.name,
          onChange: (event) => input.onChange(event.currentTarget.checked),
        }),
        props: { color: "primary" },
      },
    },
    formPostfix: "Terms",
    onSubmit: () => undefined,
    validationSchema: schema,
  });
  const store = createFormStore(factory);

  let form = store.getState().zustikFormTerms;
  assert.equal(form.errors[FORM_ERROR], "You must accept");
  assert.equal(form.components.accepted.props.checked, false);
  form.components.accepted.props.onChange({
    currentTarget: { checked: true },
  });
  form = store.getState().zustikFormTerms;
  assert.equal(form.values.accepted, true);
  assert.equal(form.valid, true);
  assert.equal(form.components.accepted.props.checked, true);
});

test("validates configuration before a store is created", () => {
  assert.throws(
    () =>
      createZustikFormSlice({
        defaultValues: { value: "" },
        fields: { value: {} },
        formPostfix: "bad postfix",
        onSubmit: () => undefined,
      }),
    /identifier/,
  );
  assert.throws(
    () =>
      createZustikFormSlice({
        defaultValues: { value: "" },
        fields: { missing: {} },
        formPostfix: "Missing",
        onSubmit: () => undefined,
      }),
    /does not exist in defaultValues/,
  );
  assert.throws(
    () =>
      createZustikFormSlice({
        defaultValues: { value: "" },
        fields: { value: { props: { label: "No component" } } },
        formPostfix: "HeadlessProps",
        onSubmit: () => undefined,
      }),
    /require a component/,
  );
  assert.throws(
    () =>
      createZustikFormSlice({
        defaultValues: { value: "" },
        fields: { value: { dependsOn: ["value"] } },
        formPostfix: "Dependency",
        onSubmit: () => undefined,
      }),
    /requires mapProps/,
  );
});

test("deep-clones defaults once for the factory and again for every store", () => {
  const defaults = { profile: { name: "Original" } };
  const factory = createZustikFormSlice({
    defaultValues: defaults,
    fields: { "profile.name": {} },
    formPostfix: "Cloned",
    onSubmit: () => undefined,
  });
  defaults.profile.name = "Mutated before store";

  const first = createFormStore(factory);
  const second = createFormStore(factory);
  assert.equal(first.getState().zustikFormCloned.values.profile.name, "Original");
  assert.equal(second.getState().zustikFormCloned.values.profile.name, "Original");

  first.getState().zustikFormCloned.setValue("profile.name", "First");
  assert.equal(second.getState().zustikFormCloned.values.profile.name, "Original");

  const initialized = { profile: { name: "Initialized" } };
  first.getState().zustikFormCloned.initialize(initialized);
  initialized.profile.name = "Mutated externally";
  assert.equal(
    first.getState().zustikFormCloned.values.profile.name,
    "Initialized",
  );
});

test("requires structured-cloneable form values", () => {
  assert.throws(
    () =>
      createZustikFormSlice({
        defaultValues: {
          transform: () => undefined,
          value: "Original",
        },
        fields: { value: {} },
        formPostfix: "NonCloneable",
        onSubmit: () => undefined,
      }),
    /structured-cloneable/,
  );

  const store = createFormStore(
    createZustikFormSlice({
      defaultValues: { value: "Original" },
      fields: { value: {} },
      formPostfix: "StructuredValues",
      onSubmit: () => undefined,
    }),
  );
  assert.throws(
    () =>
      store.getState().zustikFormStructuredValues.initialize({
        transform: () => undefined,
        value: "Changed",
      }),
    /structured-cloneable/,
  );
  assert.equal(
    store.getState().zustikFormStructuredValues.values.value,
    "Original",
  );
});

test("preserves keyed projection references for unrelated field updates", () => {
  const store = createFormStore(makeCommentFactory());
  const before = store.getState().zustikFormComment;
  before.setValue("profile.displayName", "Ada");
  const afterHeadlessChange = store.getState().zustikFormComment;

  assert.equal(afterHeadlessChange.components, before.components);
  assert.equal(afterHeadlessChange.components.comment, before.components.comment);
  assert.equal(afterHeadlessChange.fields.comment, before.fields.comment);
  assert.notEqual(
    afterHeadlessChange.fields["profile.displayName"],
    before.fields["profile.displayName"],
  );
  assert.notEqual(afterHeadlessChange.fieldProps, before.fieldProps);
  assert.equal(
    afterHeadlessChange.fieldProps.comment,
    before.fieldProps.comment,
  );

  afterHeadlessChange.fields.comment.onFocus();
  const afterFocus = store.getState().zustikFormComment;
  assert.equal(afterFocus.components, before.components);
  assert.equal(afterFocus.components.comment, before.components.comment);
  assert.notEqual(afterFocus.fields.comment, before.fields.comment);
});

test("publishes mapper failures without losing current engine values", () => {
  function MappedInput() {
    return null;
  }

  const factory = createZustikFormSlice({
    defaultValues: { value: "ready" },
    fields: {
      value: {
        component: MappedInput,
        mapProps: ({ field, input, props }) => {
          if (field.value === "explode") throw new Error("mapper exploded");
          return {
            label: props.label,
            name: field.name,
            onChange: (value) => input.onChange(value),
            value: field.value,
          };
        },
        props: { label: "Mapped" },
      },
    },
    formPostfix: "Projection",
    onSubmit: () => undefined,
  });
  const store = createFormStore(factory);
  const initialElement =
    store.getState().zustikFormProjection.components.value;

  assert.doesNotThrow(() =>
    store.getState().zustikFormProjection.setValue("value", "explode"),
  );
  let form = store.getState().zustikFormProjection;
  assert.equal(form.values.value, "explode");
  assert.equal(form.hasProjectionErrors, true);
  assert.match(String(form.projectionErrors.value), /mapper exploded/);
  assert.equal(form.fields.value.projectionError.message, "mapper exploded");
  assert.equal(form.components.value, initialElement);
  assert.equal(form.components.value.props.value, "ready");

  form.setValue("value", "recovered");
  form = store.getState().zustikFormProjection;
  assert.equal(form.values.value, "recovered");
  assert.equal(form.hasProjectionErrors, false);
  assert.deepEqual({ ...form.projectionErrors }, {});
  assert.equal(form.fields.value.projectionError, undefined);
  assert.equal(form.components.value.props.value, "recovered");
});

test("uses radio values and projects array length metadata", () => {
  function Radio() {
    return null;
  }

  const radioStore = createFormStore(
    createZustikFormSlice({
      defaultValues: { color: "blue" },
      fields: { color: { component: Radio } },
      formPostfix: "Radio",
      onSubmit: () => undefined,
    }),
  );
  radioStore.getState().zustikFormRadio.components.color.props.onChange({
    currentTarget: { checked: true, type: "radio", value: "red" },
  });
  assert.equal(radioStore.getState().zustikFormRadio.values.color, "red");

  const tagsStore = createFormStore(
    createZustikFormSlice({
      defaultValues: { tags: ["one"] },
      fields: { tags: {} },
      formPostfix: "Tags",
      onSubmit: () => undefined,
    }),
  );
  assert.equal(tagsStore.getState().zustikFormTags.fields.tags.length, 1);
  tagsStore.getState().zustikFormTags.setValue("tags", ["one", "two"]);
  assert.equal(tagsStore.getState().zustikFormTags.fields.tags.length, 2);
});
