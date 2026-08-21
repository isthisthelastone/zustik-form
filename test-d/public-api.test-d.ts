import type { ComponentType } from "react";
import * as v from "valibot";
import { createStore } from "zustand/vanilla";

import {
  FORM_ERROR,
  createZustikFormSlice,
  valueFromEvent,
  type FieldPath,
  type FieldPathValue,
  type InputOf,
  type OutputOf,
  type ZustikComponentBindingContext,
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

const createCommentFormSlice = createZustikFormSlice({
  defaultValues: {
    comment: "",
    notify: false,
    profile: { displayName: "" },
  },
  fields: {
    comment: {
      component: TextField,
      props: {
        fullWidth: true,
        onBlur: (_event: { readonly kind: "blur" }) => undefined,
      },
      valueFromChange: valueFromEvent,
    },
    notify: {
      component: Checkbox,
      mapProps: ({
        field,
        input,
        props,
      }: ZustikComponentBindingContext<
        CommentInput,
        "notify",
        typeof Checkbox
      >) => ({
        checked: field.value,
        label: props.label ?? "Notify me",
        name: field.name,
        onChange: (event: Parameters<CheckboxProps["onChange"]>[0]) =>
          input.onChange(event.currentTarget.checked),
      }),
      props: { label: "Notify me" },
    },
    "profile.displayName": {},
  },
  formId: "comment-form",
  formPostfix: "Comment",
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

type _Input = Expect<Equal<InputOf<typeof createCommentFormSlice>, CommentInput>>;
type _Output = Expect<
  Equal<OutputOf<typeof createCommentFormSlice>["comment"], number>
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

type CommentFormSlice = ZustikFormSlice<typeof createCommentFormSlice>;
type AppState = CommentFormSlice & {
  count: number;
  increment(): void;
};

const store = createStore<AppState>()((set, get, api) => ({
  ...createCommentFormSlice(set, get, api),
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));

const form = store.getState().zustikFormComment;
const comment: string = form.values.comment;
const formId: string = form.formId;
const fieldValue: string = form.fields.comment.value;
const fieldName: "comment" = form.fields.comment.name;
const formPostfix: "Comment" = form.formPostfix;
const nestedValue: string = form.fields["profile.displayName"].value;
const rootError: unknown = form.errors?.[FORM_ERROR];
const textFieldProps: Readonly<TextFieldProps> = form.fieldProps.comment;
const checkboxProps: Readonly<CheckboxProps> = form.fieldProps.notify;
const headlessName: "profile.displayName" =
  form.fieldProps["profile.displayName"].name;
const textFieldElement = form.components.comment;
const checkboxElement = form.components.notify;
form.fields.comment.onChange("next");
form.setValue("profile.displayName", "Grace");
void comment;
void formId;
void fieldValue;
void fieldName;
void formPostfix;
void nestedValue;
void rootError;
void textFieldProps;
void checkboxProps;
void headlessName;
void textFieldElement;
void checkboxElement;

// @ts-expect-error headless fields do not produce React elements
form.components["profile.displayName"];
// @ts-expect-error comment is a string input, not a number
form.fields.comment.onChange(123);
// @ts-expect-error invalid field path
form.setValue("missing", "value");

createZustikFormSlice({
  defaultValues: { title: "" },
  fields: {
    // @ts-expect-error props require a configured component
    title: { props: { label: "Title" } },
  },
  formPostfix: "HeadlessProps",
  onSubmit: () => undefined,
});

const createPlainFormSlice = createZustikFormSlice({
  defaultValues: { title: "" },
  fields: { title: {} },
  formPostfix: "Plain",
  onSubmit: (values) => {
    const title: string = values.title;
    void title;
  },
});

type _Plain = Expect<
  Equal<InputOf<typeof createPlainFormSlice>, { title: string }>
>;

void store;
