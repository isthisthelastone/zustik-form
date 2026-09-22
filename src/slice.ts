import {
  createForm as createFinalForm,
  getIn,
  type FieldState,
  type FormApi,
  type FormState,
  type FormSubscription,
  type Unsubscribe,
} from "final-form";
import {
  createElement,
  memo,
  useSyncExternalStore,
  type ComponentType,
  type ReactElement,
} from "react";

import {
  clonePreparedZustikDefinition,
  cloneZustikValues,
  prepareZustikDefinition,
  type RuntimeDefinition,
  type RuntimeFieldDefinition,
} from "./definition.js";
import type {
  AnyZustikSchema,
  FieldPath,
  LooseFieldsDefinition,
  SchemaInput,
  SchemaOutput,
  ZustikComponentBindingContext,
  ZustikDefaultFieldProps,
  ZustikFieldInput,
  ZustikFieldState,
  ZustikFieldView,
  ZustikFormDefinition,
  ZustikFormSliceBuilder,
  ZustikFormSliceFactory,
  ZustikFormView,
  ZustikPreventableEvent,
  ZustikSubmitResult,
} from "./types.js";
import { ZUSTIK_FIELD_SUBSCRIPTION } from "./types.js";
import { parseWithSchema, validateWithSchema } from "./validation.js";

const FORM_SUBSCRIPTION: Readonly<Required<FormSubscription>> = {
  active: true,
  dirty: true,
  dirtyFields: true,
  dirtyFieldsSinceLastSubmit: true,
  dirtySinceLastSubmit: true,
  error: true,
  errors: true,
  hasSubmitErrors: true,
  hasValidationErrors: true,
  initialValues: true,
  invalid: true,
  modified: true,
  modifiedSinceLastSubmit: true,
  pristine: true,
  submitError: true,
  submitErrors: true,
  submitFailed: true,
  submitting: true,
  submitSucceeded: true,
  touched: true,
  valid: true,
  validating: true,
  values: true,
  visited: true,
};

type RuntimeValues = Record<string, unknown>;
type RuntimeFieldProps = Readonly<Record<string, unknown>>;
type RuntimeFieldListener = () => void;

const EMPTY_FIELD_PROPS: RuntimeFieldProps = Object.freeze({});

interface RuntimeField {
  readonly componentOnBlur: (...args: readonly unknown[]) => void;
  readonly componentOnChange: (...args: readonly unknown[]) => void;
  readonly componentOnFocus: (...args: readonly unknown[]) => void;
  readonly definition: RuntimeFieldDefinition;
  element: ReactElement<Record<string, unknown>> | undefined;
  readonly getPropsSnapshot: () => RuntimeFieldProps;
  readonly input: ZustikFieldInput<unknown>;
  props: Record<string, unknown> | undefined;
  readonly publishProps: (props: Record<string, unknown>) => void;
  renderSignature: readonly unknown[] | undefined;
  signature: readonly unknown[] | undefined;
  readonly subscribeProps: (listener: RuntimeFieldListener) => () => void;
  view: ZustikFieldView<unknown, Record<string, unknown>> | undefined;
}

interface RuntimeFormProps {
  readonly id: string;
  readonly onReset: (event?: ZustikPreventableEvent) => Promise<void>;
  readonly onSubmit: (
    event?: ZustikPreventableEvent,
  ) => Promise<ZustikSubmitResult<RuntimeValues>>;
}

interface RuntimeCommands {
  readonly blur: (name: string) => void;
  readonly change: (name: string, value: unknown) => void;
  readonly focus: (name: string) => void;
  readonly initialize: (values: RuntimeValues) => void;
  readonly onReset: (event?: ZustikPreventableEvent) => Promise<void>;
  readonly onSubmit: (
    event?: ZustikPreventableEvent,
  ) => Promise<ZustikSubmitResult<RuntimeValues>>;
  readonly reset: () => Promise<void>;
  readonly submit: () => Promise<ZustikSubmitResult<RuntimeValues>>;
}

interface RuntimeSubmitAttempt {
  invoked: boolean;
  outcome: ZustikSubmitResult<RuntimeValues> | undefined;
}

interface RuntimeStoreContext {
  readonly get: unknown;
  readonly set: unknown;
  readonly store: object;
}

interface FormRuntime {
  active: boolean;
  readonly api: FormApi<RuntimeValues>;
  readonly commands: RuntimeCommands;
  componentsView: Readonly<Record<string, ReactElement>> | undefined;
  readonly definition: RuntimeDefinition;
  fieldPropsView: Readonly<Record<string, object>> | undefined;
  readonly fields: readonly RuntimeField[];
  fieldsView:
    | Readonly<
        Record<string, ZustikFieldView<unknown, Record<string, unknown>>>
      >
    | undefined;
  readonly formProps: RuntimeFormProps;
  readonly hostStore: RuntimeStoreContext;
  pendingForm: ZustikFormView<RuntimeDefinition> | undefined;
  pendingSubmit: Promise<ZustikSubmitResult<RuntimeValues>> | undefined;
  projectionErrorsView: Readonly<Record<string, unknown>> | undefined;
  publicSubmitAttempt: RuntimeSubmitAttempt | undefined;
  readonly stateKey: string;
  readonly unregisterFields: Unsubscribe[];
  unsubscribeForm: Unsubscribe | undefined;
}

interface StoreClaims {
  readonly formIds: Map<string, string>;
  readonly stateKeys: Set<string>;
}

const STORE_CLAIMS = new WeakMap<object, StoreClaims>();

type RuntimeSetState = (partial: Record<string, unknown>) => void;
function claimStoreNames(
  store: object,
  stateKey: string,
  formId: string,
  postfix: string,
): () => void {
  let claims = STORE_CLAIMS.get(store);
  if (claims === undefined) {
    claims = { formIds: new Map(), stateKeys: new Set() };
    STORE_CLAIMS.set(store, claims);
  }

  if (claims.stateKeys.has(stateKey)) {
    throw new Error(
      `Cannot compose form ${JSON.stringify(postfix)} because ${stateKey} is already supplied by another Zustik Form slice.`,
    );
  }
  const idOwner = claims.formIds.get(formId);
  if (idOwner !== undefined) {
    throw new Error(
      `Form ID ${JSON.stringify(formId)} is already used by ${JSON.stringify(idOwner)} in this store.`,
    );
  }

  claims.stateKeys.add(stateKey);
  claims.formIds.set(formId, postfix);
  return () => {
    claims?.stateKeys.delete(stateKey);
    claims?.formIds.delete(formId);
  };
}

function shallowCopyValues(values: object): RuntimeValues {
  return { ...values };
}

function cloneRuntimeValues(
  values: Readonly<RuntimeValues>,
): RuntimeValues {
  return cloneZustikValues(values);
}

function extractDefaultChangeValue(args: readonly unknown[]): unknown {
  const first = args[0];
  if (first === null || typeof first !== "object") {
    return first;
  }

  const event = first as {
    readonly currentTarget?: unknown;
    readonly target?: unknown;
  };
  const candidate =
    event.currentTarget !== null && typeof event.currentTarget === "object"
      ? event.currentTarget
      : event.target;

  if (candidate === null || typeof candidate !== "object") {
    return first;
  }

  const target = candidate as {
    readonly checked?: unknown;
    readonly type?: unknown;
    readonly value?: unknown;
  };
  if (target.type === "checkbox" && "checked" in target) {
    return target.checked;
  }

  return "value" in target ? target.value : first;
}

function sameSignature(
  previous: readonly unknown[] | undefined,
  next: readonly unknown[],
): boolean {
  if (previous === undefined || previous.length !== next.length) {
    return false;
  }

  for (let index = 0; index < next.length; index += 1) {
    if (!Object.is(previous[index], next[index])) {
      return false;
    }
  }
  return true;
}

function sameRecordReferences(
  previous: Readonly<Record<string, unknown>> | undefined,
  next: Readonly<Record<string, unknown>>,
): boolean {
  if (previous === undefined) return false;
  const previousKeys = Object.keys(previous);
  const nextKeys = Object.keys(next);
  return (
    previousKeys.length === nextKeys.length &&
    nextKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(previous, key) &&
        Object.is(previous[key], next[key]),
    )
  );
}

function stabilizeRecord<TValue>(
  previous: Readonly<Record<string, TValue>> | undefined,
  next: Readonly<Record<string, TValue>>,
): Readonly<Record<string, TValue>> {
  return sameRecordReferences(previous, next)
    ? (previous as Readonly<Record<string, TValue>>)
    : next;
}

function hasAnyError(errors: Record<string, unknown>): boolean {
  return Object.keys(errors).some((key) => {
    const value = errors[key];
    if (
      value !== null &&
      typeof value === "object" &&
      !(value instanceof Error)
    ) {
      return hasAnyError(value as Record<string, unknown>);
    }
    return value !== undefined;
  });
}

function callIfFunction(
  callback: unknown,
  args: readonly unknown[],
): void {
  if (typeof callback === "function") {
    Reflect.apply(callback, undefined, args);
  }
}

function toFieldState(
  name: string,
  state: FieldState<unknown> | undefined,
  formState: FormState<RuntimeValues>,
): ZustikFieldState<unknown> {
  const dirty = formState.dirtyFields?.[name] ?? false;
  const error = getIn(formState.errors ?? {}, name);
  const submitError = getIn(formState.submitErrors ?? {}, name);
  const invalid = error !== undefined || submitError !== undefined;
  return {
    active: formState.active === name,
    data: state?.data as Readonly<Record<string, unknown>> | undefined,
    dirty,
    dirtySinceLastSubmit:
      formState.dirtyFieldsSinceLastSubmit?.[name] ?? false,
    error,
    initialValue: getIn(formState.initialValues ?? {}, name),
    invalid,
    length: state?.length,
    modified: formState.modified?.[name] ?? false,
    modifiedSinceLastSubmit: state?.modifiedSinceLastSubmit ?? false,
    name,
    pristine: !dirty,
    submitError,
    submitFailed: formState.submitFailed ?? false,
    submitSucceeded: formState.submitSucceeded ?? false,
    submitting: formState.submitting ?? false,
    touched: formState.touched?.[name] ?? false,
    valid: !invalid,
    validating: state?.validating ?? false,
    value: getIn(formState.values, name),
    visited: formState.visited?.[name] ?? false,
  };
}

function fieldSignature(
  definition: RuntimeFieldDefinition,
  state: ZustikFieldState<unknown>,
  values: RuntimeValues,
): readonly unknown[] {
  const signature: unknown[] = [
    state.active,
    state.data,
    state.dirty,
    state.dirtySinceLastSubmit,
    state.error,
    state.initialValue,
    state.invalid,
    state.length,
    state.modified,
    state.modifiedSinceLastSubmit,
    state.pristine,
    state.submitError,
    state.submitFailed,
    state.submitSucceeded,
    state.submitting,
    state.touched,
    state.valid,
    state.validating,
    state.value,
    state.visited,
  ];

  if (definition.mapProps !== undefined) {
    if (definition.dependsOn === undefined) {
      signature.push(values);
    } else {
      for (const path of definition.dependsOn) {
        signature.push(getIn(values, path));
      }
    }
  }

  return signature;
}

interface BoundZustikFieldProps {
  readonly field: RuntimeField;
}

const BoundZustikField = memo(function BoundZustikField({
  field,
}: BoundZustikFieldProps): ReactElement | null {
  const props = useSyncExternalStore(
    field.subscribeProps,
    field.getPropsSnapshot,
    field.getPropsSnapshot,
  );
  const Component = field.definition.component;
  return Component === undefined
    ? null
    : createElement(Component, props as Record<string, unknown>);
});

function createFieldRuntime(
  runtime: FormRuntime,
  definition: RuntimeFieldDefinition,
): RuntimeField {
  const input: ZustikFieldInput<unknown> = {
    onBlur: () => {
      if (runtime.active) runtime.api.blur(definition.name);
    },
    onChange: (value) => {
      if (runtime.active) runtime.api.change(definition.name, value);
    },
    onFocus: () => {
      if (runtime.active) runtime.api.focus(definition.name);
    },
  };

  const userProps = definition.props ?? {};
  const listeners = new Set<RuntimeFieldListener>();
  let propsSnapshot = EMPTY_FIELD_PROPS;
  const field: RuntimeField = {
    componentOnBlur: (...args) => {
      if (!runtime.active) return;
      input.onBlur();
      callIfFunction(userProps.onBlur, args);
    },
    componentOnChange: (...args) => {
      if (!runtime.active) return;
      const value =
        definition.valueFromChange === undefined
          ? extractDefaultChangeValue(args)
          : definition.valueFromChange(...args);
      input.onChange(value);
      callIfFunction(userProps.onChange, args);
    },
    componentOnFocus: (...args) => {
      if (!runtime.active) return;
      input.onFocus();
      callIfFunction(userProps.onFocus, args);
    },
    definition,
    element: undefined,
    getPropsSnapshot: () => propsSnapshot,
    input,
    props: undefined,
    publishProps: (props) => {
      if (Object.is(propsSnapshot, props)) return;
      propsSnapshot = props;
      field.props = props;
      for (const listener of listeners) listener();
    },
    renderSignature: undefined,
    signature: undefined,
    subscribeProps: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    view: undefined,
  };
  field.element =
    definition.component === undefined
      ? undefined
      : (createElement(BoundZustikField, {
          field,
          key: definition.renderKey ?? definition.name,
        }) as unknown as ReactElement<Record<string, unknown>>);
  return field;
}

function projectField(
  runtime: FormRuntime,
  field: RuntimeField,
  formState: FormState<RuntimeValues>,
): ZustikFieldView<unknown, Record<string, unknown>> {
  const definition = field.definition;
  const state = toFieldState(
    definition.name,
    runtime.api.getFieldState(definition.name),
    formState,
  );
  const signature = fieldSignature(definition, state, formState.values);
  if (sameSignature(field.signature, signature) && field.view !== undefined) {
    return field.view;
  }

  const renderSignature =
    definition.mapProps === undefined ? [state.value] : signature;
  if (
    !sameSignature(field.renderSignature, renderSignature) ||
    field.props === undefined
  ) {
    try {
      const userProps = definition.props ?? {};
      const defaultProps: ZustikDefaultFieldProps<unknown> &
        Record<string, unknown> = {
        ...userProps,
        name: definition.name,
        onBlur: field.componentOnBlur,
        onChange: field.componentOnChange,
        onFocus: field.componentOnFocus,
        value: state.value,
      };

      const resolvedProps =
        definition.mapProps === undefined
          ? defaultProps
          : definition.mapProps({
              field: state,
              input: field.input,
              props: userProps,
              values: formState.values,
            } as ZustikComponentBindingContext<any, any, any>);
      const { key: _key, ref: _ref, ...safeProps } = resolvedProps;
      field.publishProps(safeProps);
      field.renderSignature = renderSignature;
    } catch (error) {
      if (!runtime.active || field.view === undefined) throw error;

      const failedView: ZustikFieldView<
        unknown,
        Record<string, unknown>
      > = {
        ...state,
        component: definition.component,
        element: field.element,
        onBlur: field.input.onBlur,
        onChange: field.input.onChange,
        onFocus: field.input.onFocus,
        projectionError: error,
        props: field.props ?? {},
      };
      field.signature = undefined;
      field.view = failedView;
      return failedView;
    }
  }

  const view: ZustikFieldView<unknown, Record<string, unknown>> = {
    ...state,
    component: definition.component,
    element: field.element,
    onBlur: field.input.onBlur,
    onChange: field.input.onChange,
    onFocus: field.input.onFocus,
    projectionError: undefined,
    props: field.props as Record<string, unknown>,
  };
  field.signature = signature;
  field.view = view;
  return view;
}

function createRuntimeCommands(runtime: FormRuntime): RuntimeCommands {
  const executeSubmit = async (): Promise<
    ZustikSubmitResult<RuntimeValues>
  > => {
    const attempt: RuntimeSubmitAttempt = {
      invoked: false,
      outcome: undefined,
    };
    runtime.publicSubmitAttempt = attempt;
    try {
      await Promise.resolve(runtime.api.submit());
      if (attempt.outcome !== undefined) return attempt.outcome;

      const state = runtime.api.getState();
      if (attempt.invoked || state.submitSucceeded) {
        return { status: "succeeded" };
      }
      if (state.hasSubmitErrors) {
        return {
          errors: state.submitErrors,
          status: "submission-error",
        };
      }
      return { errors: state.errors, status: "invalid" };
    } finally {
      if (runtime.publicSubmitAttempt === attempt) {
        runtime.publicSubmitAttempt = undefined;
      }
    }
  };

  const submit = (): Promise<ZustikSubmitResult<RuntimeValues>> => {
    if (runtime.pendingSubmit !== undefined) return runtime.pendingSubmit;

    const pending = executeSubmit().finally(() => {
      if (runtime.pendingSubmit === pending) {
        runtime.pendingSubmit = undefined;
      }
    });
    runtime.pendingSubmit = pending;
    return pending;
  };

  const reset = async (): Promise<void> => {
    const previousValues = runtime.api.getState().values;
    runtime.api.restart();

    const initialValues = runtime.api.getState().initialValues ?? {};
    await runtime.definition.onReset?.({
      formApi: runtime.api,
      formId: runtime.definition.formId,
      formPostfix: runtime.definition.formPostfix,
      get: runtime.hostStore.get,
      initialValues: initialValues as RuntimeValues,
      previousValues,
      set: runtime.hostStore.set,
      store: runtime.hostStore.store,
    });
  };

  const change = (name: string, value: unknown): void => {
    runtime.api.change(name, value);
  };

  return {
    blur: (name) => runtime.api.blur(name),
    change,
    focus: (name) => runtime.api.focus(name),
    initialize: (values) => runtime.api.initialize(cloneRuntimeValues(values)),
    onReset: async (event) => {
      event?.preventDefault();
      await reset();
    },
    onSubmit: async (event) => {
      event?.preventDefault();
      return submit();
    },
    reset,
    submit,
  };
}

function projectRuntime(
  runtime: FormRuntime,
  formState: FormState<RuntimeValues>,
): ZustikFormView<RuntimeDefinition> {
  const nextFields: Record<
    string,
    ZustikFieldView<unknown, Record<string, unknown>>
  > = Object.create(null) as Record<
    string,
    ZustikFieldView<unknown, Record<string, unknown>>
  >;
  for (const runtimeField of runtime.fields) {
    nextFields[runtimeField.definition.name] = projectField(
      runtime,
      runtimeField,
      formState,
    );
  }
  const fields = stabilizeRecord(runtime.fieldsView, nextFields);
  runtime.fieldsView = fields;

  const nextFieldProps: Record<string, object> = Object.create(null) as Record<
    string,
    object
  >;
  const nextComponents: Record<string, ReactElement> = Object.create(
    null,
  ) as Record<string, ReactElement>;
  const nextProjectionErrors: Record<string, unknown> = Object.create(
    null,
  ) as Record<string, unknown>;
  for (const [name, field] of Object.entries(fields)) {
    nextFieldProps[name] = field.props;
    if (field.element !== undefined) nextComponents[name] = field.element;
    if (field.projectionError !== undefined) {
      nextProjectionErrors[name] = field.projectionError;
    }
  }

  const fieldProps = stabilizeRecord(runtime.fieldPropsView, nextFieldProps);
  runtime.fieldPropsView = fieldProps;
  const components = stabilizeRecord(runtime.componentsView, nextComponents);
  runtime.componentsView = components;
  const projectionErrors = stabilizeRecord(
    runtime.projectionErrorsView,
    nextProjectionErrors,
  );
  runtime.projectionErrorsView = projectionErrors;

  const commands = runtime.commands;
  const initialValues = (formState.initialValues ??
    runtime.definition.defaultValues) as RuntimeValues;
  const form: ZustikFormView<RuntimeDefinition> = {
    active:
      typeof formState.active === "string"
        ? (formState.active as FieldPath<RuntimeValues>)
        : undefined,
    api: runtime.api,
    blur: commands.blur,
    change: commands.change,
    components: components as never,
    dirty: formState.dirty ?? false,
    dirtyFields: formState.dirtyFields ?? {},
    dirtyFieldsSinceLastSubmit:
      formState.dirtyFieldsSinceLastSubmit ?? {},
    dirtySinceLastSubmit: formState.dirtySinceLastSubmit ?? false,
    error: formState.error,
    errors: formState.hasValidationErrors ? formState.errors : undefined,
    fieldProps: fieldProps as never,
    fields: fields as never,
    focus: commands.focus,
    formId: runtime.definition.formId,
    formPostfix: runtime.definition.formPostfix,
    formProps: runtime.formProps,
    hasProjectionErrors: Object.keys(projectionErrors).length > 0,
    hasSubmitErrors: formState.hasSubmitErrors ?? false,
    hasValidationErrors: formState.hasValidationErrors ?? false,
    initialValues,
    initialize: commands.initialize,
    invalid: formState.invalid ?? false,
    modified: formState.modified ?? {},
    modifiedSinceLastSubmit: formState.modifiedSinceLastSubmit ?? false,
    onReset: commands.onReset,
    onSubmit: commands.onSubmit,
    pristine: formState.pristine ?? true,
    projectionErrors,
    reset: commands.reset,
    setValue: commands.change,
    submit: commands.submit,
    submitError: formState.submitError,
    submitErrors: formState.hasSubmitErrors
      ? formState.submitErrors
      : undefined,
    submitFailed: formState.submitFailed ?? false,
    submitSucceeded: formState.submitSucceeded ?? false,
    submitting: formState.submitting ?? false,
    touched: formState.touched ?? {},
    valid: formState.valid ?? true,
    validating: formState.validating ?? false,
    values: formState.values,
    visited: formState.visited ?? {},
  };

  return form;
}

function disposeRuntime(runtime: FormRuntime): void {
  runtime.active = false;
  runtime.unsubscribeForm?.();
  runtime.unsubscribeForm = undefined;
  for (let index = runtime.unregisterFields.length - 1; index >= 0; index -= 1) {
    runtime.unregisterFields[index]?.();
  }
  runtime.unregisterFields.length = 0;
}

function stageRuntime(
  definition: RuntimeDefinition,
  publish: (form: ZustikFormView<RuntimeDefinition>) => void,
  hostStore: RuntimeStoreContext,
): FormRuntime {
  let runtime: FormRuntime | undefined;
  const schema = definition.validationSchema;
  const api: FormApi<RuntimeValues> = createFinalForm<RuntimeValues>({
    ...(definition.options?.destroyOnUnregister === undefined
      ? {}
      : { destroyOnUnregister: definition.options.destroyOnUnregister }),
    initialValues: shallowCopyValues(definition.defaultValues),
    ...(definition.options?.keepDirtyOnReinitialize === undefined
      ? {}
      : {
          keepDirtyOnReinitialize:
            definition.options.keepDirtyOnReinitialize,
        }),
    onSubmit: async (
      inputValues,
    ): Promise<Record<string, unknown> | undefined> => {
      if (runtime === undefined || !runtime.active) return undefined;
      const publicAttempt = runtime.publicSubmitAttempt;
      if (publicAttempt !== undefined) publicAttempt.invoked = true;

      let output: unknown = inputValues;
      if (schema !== undefined) {
        const parsed = await parseWithSchema(schema, inputValues);
        if (!parsed.success) {
          if (publicAttempt !== undefined) {
            publicAttempt.outcome = {
              errors: parsed.errors,
              status: "invalid",
            };
          }
          return parsed.errors;
        }
        output = parsed.output;
      }

      if (!runtime.active) return undefined;
      const submissionErrors = (await definition.onSubmit(output, {
        formApi: api,
        formId: definition.formId,
        formPostfix: definition.formPostfix,
        get: hostStore.get,
        inputValues,
        set: hostStore.set,
        store: hostStore.store,
      })) as Record<string, unknown> | undefined;
      if (publicAttempt !== undefined) {
        publicAttempt.outcome =
          submissionErrors !== undefined && hasAnyError(submissionErrors)
            ? {
                errors: submissionErrors,
                status: "submission-error",
              }
            : { status: "succeeded" };
      }
      return submissionErrors;
    },
    ...(schema === undefined
      ? {}
      : {
          validate: (values: RuntimeValues) =>
            validateWithSchema(schema, values),
        }),
    ...(definition.options?.validateOnBlur === undefined
      ? {}
      : { validateOnBlur: definition.options.validateOnBlur }),
  });

  const runtimeShell = {
    active: true,
    api,
    commands: undefined,
    componentsView: undefined,
    definition,
    fieldPropsView: undefined,
    fields: undefined,
    fieldsView: undefined,
    formProps: undefined,
    hostStore,
    pendingForm: undefined,
    pendingSubmit: undefined,
    projectionErrorsView: undefined,
    publicSubmitAttempt: undefined,
    stateKey: `zustikForm${definition.formPostfix}`,
    unregisterFields: [],
    unsubscribeForm: undefined,
  } as unknown as FormRuntime;
  runtime = runtimeShell;
  (runtimeShell as { commands: RuntimeCommands }).commands =
    createRuntimeCommands(runtimeShell);
  (runtimeShell as { formProps: RuntimeFormProps }).formProps = Object.freeze({
    id: definition.formId,
    onReset: runtimeShell.commands.onReset,
    onSubmit: runtimeShell.commands.onSubmit,
  });
  (runtimeShell as { fields: readonly RuntimeField[] }).fields =
    definition.fields.map((field) => createFieldRuntime(runtimeShell, field));

  try {
    api.batch(() => {
      for (let index = 0; index < definition.fields.length; index += 1) {
        const field = definition.fields[index] as RuntimeFieldDefinition;
        const runtimeField = runtimeShell.fields[index] as RuntimeField;
        const unregister = api.registerField(
          field.name,
          (fieldState) => {
            const current = runtimeField.view;
            if (
              !runtimeShell.active ||
              current === undefined ||
              (Object.is(current.data, fieldState.data) &&
                current.length === fieldState.length &&
                current.modifiedSinceLastSubmit ===
                  (fieldState.modifiedSinceLastSubmit ?? false) &&
                current.validating === (fieldState.validating ?? false))
            ) {
              return;
            }

            const form = projectRuntime(runtimeShell, api.getState());
            runtimeShell.pendingForm = form;
            publish(form);
          },
          ZUSTIK_FIELD_SUBSCRIPTION,
          field.isEqual === undefined ? undefined : { isEqual: field.isEqual },
        );
        runtimeShell.unregisterFields.push(unregister);
      }
    });

    runtimeShell.unsubscribeForm = api.subscribe((state) => {
      const form = projectRuntime(runtimeShell, state);
      runtimeShell.pendingForm = form;
      publish(form);
    }, FORM_SUBSCRIPTION);
  } catch (error) {
    disposeRuntime(runtimeShell);
    throw error;
  }

  return runtimeShell;
}

export function createZustikFormSlice<
  TStoreState extends object = object,
>(): ZustikFormSliceBuilder<TStoreState>;

export function createZustikFormSlice<
  const TPostfix extends string,
  const TSchema extends AnyZustikSchema,
  const TFields extends LooseFieldsDefinition,
>(
  definition: Omit<
    ZustikFormDefinition<
      TPostfix,
      SchemaInput<TSchema>,
      SchemaOutput<TSchema>,
      TFields,
      TSchema
    >,
    "fields"
  > & {
    readonly fields: TFields;
    readonly validationSchema: TSchema;
  },
): ZustikFormSliceFactory<
  ZustikFormDefinition<
    TPostfix,
    SchemaInput<TSchema>,
    SchemaOutput<TSchema>,
    TFields,
    TSchema
  >
>;

export function createZustikFormSlice<
  const TPostfix extends string,
  TInput extends object,
  const TFields extends LooseFieldsDefinition,
>(
  definition: Omit<
    ZustikFormDefinition<TPostfix, TInput, TInput, TFields, undefined>,
    "fields"
  > & {
    readonly fields: TFields;
  },
): ZustikFormSliceFactory<
  ZustikFormDefinition<TPostfix, TInput, TInput, TFields, undefined>
>;

/**
 * Creates one static form-slice factory. Call with a configuration directly,
 * or call with a store contract generic first to type the lifecycle context's
 * set, get, and store accessors. Every containing Zustand store receives an
 * independent Final Form runtime.
 */
export function createZustikFormSlice(
  rawDefinition?: object,
): ZustikFormSliceFactory<any, any> | ZustikFormSliceBuilder<any> {
  if (rawDefinition === undefined) {
    return ((definition: object) => {
      const template = prepareZustikDefinition(definition as never);
      return createSliceFromDefinition(template);
    }) as ZustikFormSliceBuilder<any>;
  }

  const template = prepareZustikDefinition(rawDefinition as never);
  return createSliceFromDefinition(template);
}

function createSliceFromDefinition(
  template: RuntimeDefinition,
): ZustikFormSliceFactory<any, any> {
  return ((setState, getState, store) => {
    const definition = clonePreparedZustikDefinition(template);

    const stateKey = `zustikForm${definition.formPostfix}`;
    const releaseClaims = claimStoreNames(
      store,
      stateKey,
      definition.formId,
      definition.formPostfix,
    );
    const publishState = setState as RuntimeSetState;
    let initializing = true;
    let latestForm: ZustikFormView<RuntimeDefinition> | undefined;

    try {
      const runtime = stageRuntime(
        definition,
        (form) => {
          latestForm = form;
          if (!initializing) publishState({ [stateKey]: form });
        },
        { get: getState, set: setState, store },
      );
      const form =
        latestForm ??
        runtime.pendingForm ??
        projectRuntime(runtime, runtime.api.getState());
      latestForm = form;
      initializing = false;
      return { [stateKey]: form };
    } catch (error) {
      releaseClaims();
      throw error;
    }
  }) as ZustikFormSliceFactory<any, any>;
}
