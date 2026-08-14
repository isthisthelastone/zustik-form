import type { ComponentType } from "react";
import * as v from "valibot";
import { createStore } from "zustand/vanilla";

import {
  FORM_ERROR,
  defineZustikField,
  defineZustikForm,
  valueFromEvent,
  type FieldPath,
  type FieldPathValue,
  zustikFormCreate,
  type InputOf,
  type OutputOf,
  type ZustikFormSlice,
} from "../src/index.js";

type Equal<TLeft, TRight> =
  (<T>() => T extends TLeft ? 1 : 2) extends <T>() =>
    T extends TRight ? 1 : 2
    ? true
    : false;
type Expect<TValue extends true> = TValue;

const CommentSchema = v.object({
  comment: v.pipe(
    v.string(),
    v.maxLength(256),
    v.transform((value) => value.length),
  ),
  notify: v.boolean(),
  profile: v.object({ displayName: v.string() }),
});

type CommentInput = v.InferInput<typeof CommentSchema>;

interface TextFieldProps {
  fullWidth: boolean;
  name: string;
  onBlur?: (event: { readonly kind: "blur" }) => void;
  onChange: (event: {
    readonly currentTarget: { readonly value: string };
  }) => void;
  onFocus?: (event: { readonly kind: "focus" }) => void;
  value: string;
}

const TextField: ComponentType<TextFieldProps> = () => null;

interface CheckboxProps {
  checked: boolean;
  label: string;
  name: string;
  onChange(event: {
    readonly currentTarget: { readonly checked: boolean };
  }): void;
}

const Checkbox: ComponentType<CheckboxProps> = () => null;
const field = defineZustikField<CommentInput>();

const commentDefinition = defineZustikForm({
  defaultValues: {
    comment: "",
    notify: false,
    profile: { displayName: "" },
  },
  fields: [
    field({
      component: TextField,
      componentProps: {
        fullWidth: true,
        onBlur: (_event) => undefined,
      },
      name: "comment",
      valueFromChange: valueFromEvent,
    }),
    field({
      component: Checkbox,
      componentProps: { label: "Notify me" },
      controlledProps: ["name", "checked", "onChange"] as const,
      mapComponentProps: ({ componentProps, field: fieldState, input }) => ({
        ...componentProps,
        checked: fieldState.value,
        name: fieldState.name,
        onChange: (event) => input.onChange(event.currentTarget.checked),
      }),
      name: "notify",
    }),
    field({ name: "profile.displayName" }),
  ] as const,
  formPostfix: "Comment",
  formId: "comment-form",
  onReset: (context) => {
    const value: string = context.previousValues.comment;
    const postfix: "Comment" = context.formPostfix;
    void value;
    void postfix;
  },
  onSubmit: (values, context) => {
    const length: number = values.comment;
    const original: string = context.inputValues.comment;
    const postfix: "Comment" = context.formPostfix;
    void length;
    void original;
    void postfix;
  },
  validationSchema: CommentSchema,
});

type _Input = Expect<Equal<InputOf<typeof commentDefinition>, CommentInput>>;
type _Output = Expect<
  Equal<OutputOf<typeof commentDefinition>["comment"], number>
>;

type OptionalValues = {
  items?: ({ label: string } | null)[];
  profile?: { name: string } | null;
};
type _OptionalObjectPath = Expect<
  Equal<
    FieldPathValue<OptionalValues, "profile.name">,
    string | null | undefined
  >
>;
type _OptionalArrayPath = Expect<
  Equal<
    FieldPathValue<OptionalValues, `items.${number}.label`>,
    string | null | undefined
  >
>;
type _OptionalPathsExist = Expect<
  Equal<
    Extract<
      "profile.name" | `items.${number}.label`,
      FieldPath<OptionalValues>
    >,
    "profile.name" | `items.${number}.label`
  >
>;

interface Forms {
  Comment: typeof commentDefinition;
}

type FormSlice = ZustikFormSlice<Forms>;
type AppState = FormSlice & {
  count: number;
  increment(): void;
};

const createFormsSlice = zustikFormCreate<Forms, AppState>();
const store = createStore<AppState>()((set, get, api) => ({
  ...createFormsSlice(set, get, api),
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));

store.getState().createForm(commentDefinition);
const slot = store.getState().zustikFormComment;
if (slot !== undefined) {
  const comment: string = slot.form.values.comment;
  const formId: string = slot.form.formId;
  const fieldValue: string = slot.form.fields[0].value;
  const fieldName: "comment" = slot.form.fields[0].name;
  const formPostfix: "Comment" = slot.form.formPostfix;
  const nestedValue: string = slot.form.fieldsByName["profile.displayName"].value;
  const rootError: unknown = slot.form.errors?.[FORM_ERROR];
  slot.form.fields[0].onChange("next");
  slot.form.change("profile.displayName", "Grace");
  void comment;
  void formId;
  void fieldValue;
  void fieldName;
  void formPostfix;
  void nestedValue;
  void rootError;

  // @ts-expect-error comment is a string input, not a number
  slot.form.fields[0].onChange(123);
  // @ts-expect-error invalid field path
  slot.form.change("missing", "value");
}

// @ts-expect-error only declared form postfixes can be destroyed
store.getState().destroyForm("Missing");

// @ts-expect-error a component's required non-controlled props are required
field({ component: TextField, name: "comment" });

// @ts-expect-error custom controlled props require an explicit mapper
field({ component: Checkbox, componentProps: { label: "Notify me" }, controlledProps: ["name", "checked", "onChange"] as const, name: "notify" });

// @ts-expect-error field names are inferred from schema input
field({ name: "doesNotExist" });

const plainDefinition = defineZustikForm({
  defaultValues: { title: "" },
  fields: [{ name: "title" }] as const,
  formPostfix: "Plain",
  onSubmit: (values) => {
    const title: string = values.title;
    void title;
  },
});

type _Plain = Expect<
  Equal<InputOf<typeof plainDefinition>, { title: string }>
>;

void store;
