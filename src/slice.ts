import {
  createForm as createFinalForm,
  getIn,
  type FieldState,
  type FormApi,
  type FormState,
  type FormSubscription,
  type Unsubscribe,
} from "final-form";
import { createElement, type ComponentType, type ReactElement } from "react";
import type {
  StateCreator,
  StoreMutatorIdentifier,
} from "zustand/vanilla";

import {
  assertZustikDefinition,
  assertZustikPostfix,
  cloneZustikValues,
} from "./definition.js";
import type {
  AnyZustikSchema,
  FieldPath,
  InputOf,
  RegisteredDefinitionUnion,
  ZustikComponentBindingContext,
  ZustikCreateFormOptions,
  ZustikDefaultFieldProps,
  ZustikFieldInput,
  ZustikFieldRenderState,
  ZustikFieldView,
  ZustikFormDefinition,
  ZustikFormSlice,
  ZustikFormSlot,
  ZustikFormView,
  ZustikPreventableEvent,
  ZustikSubmitResult,
} from "./types.js";
import { ZUSTIK_FIELD_SUBSCRIPTION } from "./types.js";
import {
  parseWithSchema,
  validateWithSchema,
} from "./validation.js";

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

interface RuntimeFieldDefinition {
  readonly component?: ComponentType<any>;
  readonly componentProps?: Readonly<Record<string, unknown>>;
  readonly dependsOn?: readonly string[];
  readonly isEqual?: (previous: unknown, next: unknown) => boolean;
  readonly mapComponentProps?: (
    context: ZustikComponentBindingContext<any, any, any>,
  ) => Record<string, unknown>;
  readonly name: string;
  readonly renderKey?: string | number | bigint;
  readonly valueFromChange?: (...args: readonly unknown[]) => unknown;
}

interface RuntimeDefinition {
  readonly defaultValues: RuntimeValues;
  readonly fields: readonly RuntimeFieldDefinition[];
  readonly formId?: string;
  readonly formPostfix: string;
  readonly onReset?: (context: {
    readonly formApi: FormApi<RuntimeValues>;
    readonly formId: string;
    readonly formPostfix: string;
    readonly initialValues: Readonly<RuntimeValues>;
    readonly previousValues: Readonly<RuntimeValues>;
  }) => void | Promise<void>;
  readonly onSubmit: (
    values: unknown,
    context: {
      readonly formApi: FormApi<RuntimeValues>;
      readonly formId: string;
      readonly formPostfix: string;
      readonly inputValues: Readonly<RuntimeValues>;
    },
  ) => unknown;
  readonly options?: Readonly<{
    readonly destroyOnUnregister?: boolean;
    readonly keepDirtyOnReinitialize?: boolean;
    readonly validateOnBlur?: boolean;
  }>;
  readonly validationSchema?: AnyZustikSchema;
}

interface RuntimeField {
  readonly componentOnBlur: (...args: readonly unknown[]) => void;
  readonly componentOnChange: (...args: readonly unknown[]) => void;
  readonly componentOnFocus: (...args: readonly unknown[]) => void;
  readonly definition: RuntimeFieldDefinition;
  element: ReactElement<Record<string, unknown>> | undefined;
  readonly input: ZustikFieldInput<unknown>;
  props: Record<string, unknown> | undefined;
  renderSignature: readonly unknown[] | undefined;
  signature: readonly unknown[] | undefined;
  view: ZustikFieldView<unknown, Record<string, unknown>> | undefined;
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

interface FormRuntime {
  active: boolean;
  readonly api: FormApi<RuntimeValues>;
  readonly commands: RuntimeCommands;
  componentsView: readonly ReactElement[] | undefined;
  readonly definition: RuntimeDefinition;
  readonly fields: readonly RuntimeField[];
  fieldsByNameView:
    | Readonly<
        Record<
          string,
          ZustikFieldView<unknown, Record<string, unknown>>
        >
      >
    | undefined;
  fieldsView:
    | readonly ZustikFieldView<unknown, Record<string, unknown>>[]
    | undefined;
  readonly generation: number;
  readonly stateKey: string;
  pendingSlot: ZustikFormSlot<RuntimeDefinition> | undefined;
  projectionErrorsView: Readonly<Record<string, unknown>> | undefined;
  publicSubmitAttempt: RuntimeSubmitAttempt | undefined;
  pendingSubmit: Promise<ZustikSubmitResult<RuntimeValues>> | undefined;
  readonly unregisterFields: Unsubscribe[];
  unsubscribeForm: Unsubscribe | undefined;
}

interface RuntimeManager {
  readonly ids: Map<string, string>;
  readonly ownedStateKeys: Set<string>;
  readonly runtimes: Map<string, FormRuntime>;
  generation: number;
}

type RuntimeSetState = (
  partial:
    | Record<string, unknown>
    | ((state: Record<string, unknown>) => Record<string, unknown>),
) => void;

type RuntimeGetState = () => Record<string, unknown>;

function shallowCopyValues(values: object): RuntimeValues {
  return { ...values };
}

function cloneRuntimeValues(
  values: Readonly<RuntimeValues>,
): RuntimeValues {
  return cloneZustikValues(values);
}

function prepareDefinition(definition: RuntimeDefinition): RuntimeDefinition {
  assertZustikDefinition(definition);

  if (
    definition.validationSchema !== undefined &&
    (definition.validationSchema === null ||
      typeof definition.validationSchema !== "object" ||
      !("~run" in definition.validationSchema))
  ) {
    throw new TypeError("validationSchema must be a Valibot schema.");
  }

  return {
    ...definition,
    defaultValues: cloneRuntimeValues(definition.defaultValues),
    fields: definition.fields.map((field) => {
      const componentProps = field.componentProps;
      return {
        ...field,
        ...(componentProps === undefined
          ? {}
          : { componentProps: { ...componentProps } }),
        ...(field.dependsOn === undefined
          ? {}
          : { dependsOn: [...field.dependsOn] }),
      };
    }),
    ...(definition.options === undefined
      ? {}
      : { options: { ...definition.options } }),
  };
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

function sameReferences<TValue>(
  previous: readonly TValue[] | undefined,
  next: readonly TValue[],
): boolean {
  return (
    previous !== undefined &&
    previous.length === next.length &&
    previous.every((value, index) => value === next[index])
  );
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

function hasAnyError(errors: Record<string, unknown>): boolean {
  return Object.keys(errors).some((key) => {
    const value = errors[key];
    if (value !== null && typeof value === "object" && !(value instanceof Error)) {
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

function toFieldRenderState(
  name: string,
  state: FieldState<unknown> | undefined,
  formState: FormState<RuntimeValues>,
): ZustikFieldRenderState<unknown> {
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
  state: ZustikFieldRenderState<unknown>,
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

  if (definition.mapComponentProps !== undefined) {
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

function createFieldRuntime(
  runtime: FormRuntime,
  definition: RuntimeFieldDefinition,
): RuntimeField {
  const isCurrent = (): boolean => runtime.active;
  const input: ZustikFieldInput<unknown> = {
    onBlur: () => {
      if (isCurrent()) {
        runtime.api.blur(definition.name);
      }
    },
    onChange: (value) => {
      if (isCurrent()) {
        runtime.api.change(definition.name, value);
      }
    },
    onFocus: () => {
      if (isCurrent()) {
        runtime.api.focus(definition.name);
      }
    },
  };

  const userProps = definition.componentProps ?? {};
  const field: RuntimeField = {
    componentOnBlur: (...args) => {
      if (!isCurrent()) return;
      input.onBlur();
      callIfFunction(userProps.onBlur, args);
    },
    componentOnChange: (...args) => {
      if (!isCurrent()) return;
      const value =
        definition.valueFromChange === undefined
          ? extractDefaultChangeValue(args)
          : definition.valueFromChange(...args);
      input.onChange(value);
      callIfFunction(userProps.onChange, args);
    },
    componentOnFocus: (...args) => {
      if (!isCurrent()) return;
      input.onFocus();
      callIfFunction(userProps.onFocus, args);
    },
    definition,
    element: undefined,
    input,
    props: undefined,
    renderSignature: undefined,
    signature: undefined,
    view: undefined,
  };
  return field;
}

function projectField(
  runtime: FormRuntime,
  field: RuntimeField,
  formState: FormState<RuntimeValues>,
): ZustikFieldView<unknown, Record<string, unknown>> {
  const definition = field.definition;
  const renderState = toFieldRenderState(
    definition.name,
    runtime.api.getFieldState(definition.name),
    formState,
  );
  const signature = fieldSignature(
    definition,
    renderState,
    formState.values,
  );
  if (sameSignature(field.signature, signature) && field.view !== undefined) {
    return field.view;
  }

  const renderSignature =
    definition.mapComponentProps === undefined
      ? [renderState.value]
      : signature;
  if (
    !sameSignature(field.renderSignature, renderSignature) ||
    field.props === undefined
  ) {
    try {
      const userProps = definition.componentProps ?? {};
      const defaultProps: ZustikDefaultFieldProps<unknown> &
        Record<string, unknown> = {
        ...userProps,
        name: definition.name,
        onBlur: field.componentOnBlur,
        onChange: field.componentOnChange,
        onFocus: field.componentOnFocus,
        value: renderState.value,
      };

      const resolvedProps =
        definition.mapComponentProps === undefined
          ? defaultProps
          : definition.mapComponentProps({
              componentProps: userProps,
              field: renderState,
              input: field.input,
              values: formState.values,
            });
      const { key: _key, ref: _ref, ...safeProps } = resolvedProps;
      field.props = safeProps;
      field.element =
        definition.component === undefined
          ? undefined
          : (createElement(definition.component, {
              ...safeProps,
              key: definition.renderKey ?? definition.name,
            }) as ReactElement<Record<string, unknown>>);
      if (field.element !== undefined) {
        field.props = field.element.props;
      }
      field.renderSignature = renderSignature;
    } catch (error) {
      if (!runtime.active || field.view === undefined) throw error;

      const failedView: ZustikFieldView<
        unknown,
        Record<string, unknown>
      > = {
        ...renderState,
        component: definition.component,
        element: field.element,
        onBlur: field.input.onBlur,
        onChange: field.input.onChange,
        onFocus: field.input.onFocus,
        projectionError: error,
        props: field.props ?? {},
      };
      // Retry the mapper on the next projection while still publishing the
      // latest Final Form state instead of leaving Zustand silently stale.
      field.signature = undefined;
      field.view = failedView;
      return failedView;
    }
  }

  const view: ZustikFieldView<unknown, Record<string, unknown>> = {
    ...renderState,
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

function isRuntimeCurrent(
  manager: RuntimeManager,
  runtime: FormRuntime,
): boolean {
  return (
    runtime.active &&
    manager.runtimes.get(runtime.definition.formPostfix) === runtime
  );
}

function createRuntimeCommands(
  manager: RuntimeManager,
  runtime: FormRuntime,
): RuntimeCommands {
  const isCurrent = (): boolean => isRuntimeCurrent(manager, runtime);

  const executeSubmit = async (): Promise<
    ZustikSubmitResult<RuntimeValues>
  > => {
    if (!isCurrent()) return { status: "destroyed" };

    const attempt: RuntimeSubmitAttempt = {
      invoked: false,
      outcome: undefined,
    };
    runtime.publicSubmitAttempt = attempt;
    try {
      await Promise.resolve(runtime.api.submit());
      if (!isCurrent()) return { status: "destroyed" };
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
    if (!isCurrent()) return Promise.resolve({ status: "destroyed" });
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
    if (!isCurrent()) return;

    const previousValues = runtime.api.getState().values;
    runtime.api.restart();
    if (!isCurrent()) return;

    const initialValues = runtime.api.getState().initialValues ?? {};
    await runtime.definition.onReset?.({
      formApi: runtime.api,
      formId: runtime.definition.formId as string,
      formPostfix: runtime.definition.formPostfix,
      initialValues: initialValues as RuntimeValues,
      previousValues,
    });
  };

  return {
    blur: (name) => {
      if (isCurrent()) runtime.api.blur(name);
    },
    change: (name, value) => {
      if (isCurrent()) runtime.api.change(name, value);
    },
    focus: (name) => {
      if (isCurrent()) runtime.api.focus(name);
    },
    initialize: (values) => {
      if (isCurrent()) {
        runtime.api.initialize(cloneRuntimeValues(values));
      }
    },
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
): ZustikFormSlot<RuntimeDefinition> {
  const nextFields = runtime.fields.map((field) =>
    projectField(runtime, field, formState),
  );
  const fields = sameReferences(runtime.fieldsView, nextFields)
    ? (runtime.fieldsView as typeof nextFields)
    : nextFields;
  if (fields !== runtime.fieldsView) {
    const fieldsByName: Record<
      string,
      ZustikFieldView<unknown, Record<string, unknown>>
    > = Object.create(null) as Record<
      string,
      ZustikFieldView<unknown, Record<string, unknown>>
    >;
    for (const field of fields) fieldsByName[field.name] = field;
    runtime.fieldsByNameView = fieldsByName;
    runtime.fieldsView = fields;
  }
  const nextComponents = fields.flatMap((field) =>
    field.element === undefined ? [] : [field.element],
  );
  const components = sameReferences(runtime.componentsView, nextComponents)
    ? (runtime.componentsView as typeof nextComponents)
    : nextComponents;
  runtime.componentsView = components;
  const fieldsByName = runtime.fieldsByNameView as Readonly<
    Record<string, ZustikFieldView<unknown, Record<string, unknown>>>
  >;
  const projectionErrors: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  for (const field of fields) {
    if (field.projectionError !== undefined) {
      projectionErrors[field.name] = field.projectionError;
    }
  }
  const stableProjectionErrors = sameRecordReferences(
    runtime.projectionErrorsView,
    projectionErrors,
  )
    ? (runtime.projectionErrorsView as Readonly<Record<string, unknown>>)
    : projectionErrors;
  runtime.projectionErrorsView = stableProjectionErrors;

  const commands = runtime.commands;
  const initialValues = (formState.initialValues ??
    runtime.definition.defaultValues) as RuntimeValues;
  const form: ZustikFormView<RuntimeDefinition> = {
    active:
      typeof formState.active === "string"
        ? (formState.active as FieldPath<RuntimeValues>)
        : undefined,
    blur: commands.blur,
    change: commands.change,
    components,
    dirty: formState.dirty ?? false,
    dirtyFields: formState.dirtyFields ?? {},
    dirtyFieldsSinceLastSubmit:
      formState.dirtyFieldsSinceLastSubmit ?? {},
    dirtySinceLastSubmit: formState.dirtySinceLastSubmit ?? false,
    error: formState.error,
    errors: formState.hasValidationErrors ? formState.errors : undefined,
    fields: fields as never,
    fieldsByName: fieldsByName as never,
    focus: commands.focus,
    formId: runtime.definition.formId as string,
    formPostfix: runtime.definition.formPostfix,
    hasSubmitErrors: formState.hasSubmitErrors ?? false,
    hasValidationErrors: formState.hasValidationErrors ?? false,
    hasProjectionErrors: Object.keys(stableProjectionErrors).length > 0,
    initialValues,
    initialize: commands.initialize,
    invalid: formState.invalid ?? false,
    modified: formState.modified ?? {},
    modifiedSinceLastSubmit: formState.modifiedSinceLastSubmit ?? false,
    onReset: commands.onReset,
    onSubmit: commands.onSubmit,
    pristine: formState.pristine ?? true,
    projectionErrors: stableProjectionErrors,
    reset: commands.reset,
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

  return { form };
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
  manager: RuntimeManager,
  definition: RuntimeDefinition,
  publish: (
    runtime: FormRuntime,
    slot: ZustikFormSlot<RuntimeDefinition>,
  ) => void,
): FormRuntime {
  let runtime: FormRuntime | undefined;
  const schema = definition.validationSchema;
  const api: FormApi<RuntimeValues> = createFinalForm<RuntimeValues>({
    ...(definition.options?.destroyOnUnregister === undefined
      ? {}
      : {
          destroyOnUnregister:
            definition.options.destroyOnUnregister,
        }),
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
      if (runtime === undefined || !isRuntimeCurrent(manager, runtime)) {
        return undefined;
      }
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

      if (!isRuntimeCurrent(manager, runtime)) return undefined;
      const submissionErrors = (await definition.onSubmit(output, {
        formApi: api,
        formId: definition.formId as string,
        formPostfix: definition.formPostfix,
        inputValues,
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
      : { validate: (values: RuntimeValues) => validateWithSchema(schema, values) }),
    ...(definition.options?.validateOnBlur === undefined
      ? {}
      : { validateOnBlur: definition.options.validateOnBlur }),
  });

  const runtimeShell = {
    active: false,
    api,
    commands: undefined,
    componentsView: undefined,
    definition,
    fields: undefined,
    fieldsByNameView: undefined,
    fieldsView: undefined,
    generation: manager.generation,
    pendingSlot: undefined,
    pendingSubmit: undefined,
    projectionErrorsView: undefined,
    publicSubmitAttempt: undefined,
    stateKey: `zustikForm${definition.formPostfix}`,
    unregisterFields: [],
    unsubscribeForm: undefined,
  } as unknown as FormRuntime;
  runtime = runtimeShell;
  (runtimeShell as { commands: RuntimeCommands }).commands =
    createRuntimeCommands(manager, runtimeShell);
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

            const slot = projectRuntime(runtimeShell, api.getState());
            runtimeShell.pendingSlot = slot;
            publish(runtimeShell, slot);
          },
          ZUSTIK_FIELD_SUBSCRIPTION,
          field.isEqual === undefined ? undefined : { isEqual: field.isEqual },
        );
        runtimeShell.unregisterFields.push(unregister);
      }
    });

    runtimeShell.unsubscribeForm = api.subscribe((state: FormState<RuntimeValues>) => {
      const slot = projectRuntime(runtimeShell, state);
      runtimeShell.pendingSlot = slot;
      if (runtimeShell.active) publish(runtimeShell, slot);
    }, FORM_SUBSCRIPTION);
  } catch (error) {
    disposeRuntime(runtimeShell);
    throw error;
  }

  return runtimeShell;
}

export function zustikFormCreate<
  TRegistry extends object,
  TState extends ZustikFormSlice<TRegistry> = ZustikFormSlice<TRegistry>,
  TMutators extends [StoreMutatorIdentifier, unknown][] = [],
>(): StateCreator<TState, TMutators, [], ZustikFormSlice<TRegistry>>;

export function zustikFormCreate<
  TRegistry extends object,
  const TActionPostfix extends string,
  TState extends ZustikFormSlice<TRegistry, TActionPostfix> = ZustikFormSlice<
    TRegistry,
    TActionPostfix
  >,
  TMutators extends [StoreMutatorIdentifier, unknown][] = [],
>(
  actionPostfix: TActionPostfix,
): StateCreator<
  TState,
  TMutators,
  [],
  ZustikFormSlice<TRegistry, TActionPostfix>
>;

/**
 * Creates the Zustand slice that owns all vanilla Final Form instances.
 * React is used only to create immutable element descriptions during state
 * projection; this slice never uses hooks or component lifecycle.
 */
export function zustikFormCreate(
  actionPostfix = "",
): StateCreator<
  Record<string, unknown>,
  [],
  [],
  Record<string, unknown>
> {
  if (actionPostfix.length > 0) {
    assertZustikPostfix(actionPostfix, "action postfix");
  }

  return ((set, get) => {
    const setState = set as RuntimeSetState;
    const getState = get as RuntimeGetState;
    const manager: RuntimeManager = {
      generation: 0,
      ids: new Map(),
      ownedStateKeys: new Set(),
      runtimes: new Map(),
    };

    const publish = (
      runtime: FormRuntime,
      slot: ZustikFormSlot<RuntimeDefinition>,
    ): void => {
      if (!isRuntimeCurrent(manager, runtime)) return;
      setState({ [runtime.stateKey]: slot });
    };

    const create = (
      rawDefinition: RegisteredDefinitionUnion<Record<string, unknown>>,
      options?: ZustikCreateFormOptions,
    ): ZustikFormSlot<RuntimeDefinition> => {
      const definition = prepareDefinition(
        rawDefinition as unknown as RuntimeDefinition,
      );
      const postfix = definition.formPostfix;
      const previous = manager.runtimes.get(postfix);
      if (previous !== undefined && options?.replace !== true) {
        throw new Error(
          `Form ${JSON.stringify(postfix)} already exists. Pass { replace: true } to replace it.`,
        );
      }

      const stateKey = `zustikForm${postfix}`;
      if (
        previous === undefined &&
        Object.prototype.hasOwnProperty.call(getState(), stateKey) &&
        !manager.ownedStateKeys.has(stateKey)
      ) {
        throw new Error(
          `Cannot create form ${JSON.stringify(postfix)} because ${stateKey} is already used by the store.`,
        );
      }

      manager.generation += 1;
      const formId =
        definition.formId ??
        `zustik-${definition.formPostfix}-${manager.generation}`;
      const idOwner = manager.ids.get(formId);
      if (idOwner !== undefined && idOwner !== postfix) {
        throw new Error(
          `Form ID ${JSON.stringify(formId)} is already used by ${JSON.stringify(idOwner)}.`,
        );
      }

      const nextDefinition: RuntimeDefinition = {
        ...definition,
        formId,
      };
      const next = stageRuntime(manager, nextDefinition, publish);
      if (previous !== undefined) {
        disposeRuntime(previous);
        manager.ids.delete(previous.definition.formId as string);
      }

      manager.runtimes.set(postfix, next);
      manager.ids.set(formId, postfix);
      manager.ownedStateKeys.add(stateKey);
      next.active = true;
      const slot =
        next.pendingSlot ?? projectRuntime(next, next.api.getState());
      next.pendingSlot = slot;
      publish(next, slot);
      return slot;
    };

    const destroy = (formPostfix: string): boolean => {
      const runtime = manager.runtimes.get(formPostfix);
      if (runtime === undefined) return false;

      manager.runtimes.delete(formPostfix);
      manager.ids.delete(runtime.definition.formId as string);
      disposeRuntime(runtime);
      setState({ [runtime.stateKey]: undefined });
      return true;
    };

    const disposeAll = (): void => {
      if (manager.runtimes.size === 0) return;

      const patch: Record<string, unknown> = {};
      for (const runtime of manager.runtimes.values()) {
        patch[runtime.stateKey] = undefined;
        disposeRuntime(runtime);
      }
      manager.runtimes.clear();
      manager.ids.clear();
      setState(patch);
    };

    return {
      [`createForm${actionPostfix}`]: create,
      [`destroyForm${actionPostfix}`]: destroy,
      [`disposeForms${actionPostfix}`]: disposeAll,
      [`getFormApi${actionPostfix}`]: (formPostfix: string) =>
        manager.runtimes.get(formPostfix)?.api,
      [`hasForm${actionPostfix}`]: (formPostfix: string) =>
        manager.runtimes.has(formPostfix),
    };
  }) as StateCreator<
    Record<string, unknown>,
    [],
    [],
    Record<string, unknown>
  >;
}

/** Alias for teams that prefer conventional Zustand slice naming. */
export const createZustikFormSlice: typeof zustikFormCreate =
  zustikFormCreate;
