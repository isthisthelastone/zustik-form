import type {
  ARRAY_ERROR,
  FieldSubscription,
  FORM_ERROR,
  FormApi,
  SubmissionErrors,
} from "final-form";
import type {
  ComponentPropsWithoutRef,
  ComponentType,
  Key,
  ReactElement,
} from "react";
import type { StoreApi } from "zustand/vanilla";
import type {
  BaseIssue,
  BaseSchema,
  BaseSchemaAsync,
  InferInput,
  InferOutput,
} from "valibot";

export type MaybePromise<T> = T | Promise<T>;

export type AnyZustikSchema =
  | BaseSchema<unknown, unknown, BaseIssue<unknown>>
  | BaseSchemaAsync<unknown, unknown, BaseIssue<unknown>>;

type AtomicValue =
  | bigint
  | boolean
  | Date
  | Function
  | null
  | number
  | RegExp
  | string
  | symbol
  | undefined;

type PreviousDepth = [never, 0, 1, 2, 3, 4, 5];

type FieldPathInternal<TValue, TDepth extends number> = [TDepth] extends [never]
  ? never
  : TValue extends AtomicValue
    ? never
    : TValue extends readonly (infer TItem)[]
      ?
          | `${number}`
          | (FieldPathInternal<TItem, PreviousDepth[TDepth]> extends infer TRest
              ? TRest extends string
                ? `${number}.${TRest}`
                : never
              : never)
      : TValue extends object
        ? {
            [TKey in Extract<keyof TValue, string>]:
              | TKey
              | (FieldPathInternal<
                    TValue[TKey],
                    PreviousDepth[TDepth]
                  > extends infer TRest
                  ? TRest extends string
                    ? `${TKey}.${TRest}`
                    : never
                  : never);
          }[Extract<keyof TValue, string>]
        : never;

/** A dot-separated field path, capped at five nested levels for compiler speed. */
export type FieldPath<TValues> = FieldPathInternal<TValues, 5>;

type SegmentValue<TValue, TSegment extends string> = TValue extends unknown
  ? TValue extends null | undefined
    ? TValue
    : TValue extends readonly (infer TItem)[]
      ? TSegment extends `${number}`
        ? TItem
        : never
      : TSegment extends keyof TValue
        ? TValue[TSegment]
        : never
  : never;

/** Resolves the value stored at a {@link FieldPath}. */
export type FieldPathValue<
  TValues,
  TPath extends string,
> = TPath extends `${infer THead}.${infer TTail}`
  ? FieldPathValue<SegmentValue<TValues, THead>, TTail>
  : SegmentValue<TValues, TPath>;

export interface ZustikFieldInput<TValue> {
  readonly onBlur: () => void;
  readonly onChange: (value: TValue) => void;
  readonly onFocus: () => void;
}

export interface ZustikFieldState<
  TValue,
  TName extends string = string,
> {
  readonly active: boolean;
  readonly data: Readonly<Record<string, unknown>> | undefined;
  readonly dirty: boolean;
  readonly dirtySinceLastSubmit: boolean;
  readonly error: unknown;
  readonly initialValue: TValue | undefined;
  readonly invalid: boolean;
  readonly length: number | undefined;
  readonly modified: boolean;
  readonly modifiedSinceLastSubmit: boolean;
  readonly name: TName;
  readonly pristine: boolean;
  readonly submitError: unknown;
  readonly submitFailed: boolean;
  readonly submitSucceeded: boolean;
  readonly submitting: boolean;
  readonly touched: boolean;
  readonly valid: boolean;
  readonly validating: boolean;
  readonly value: TValue;
  readonly visited: boolean;
}

/** @deprecated Use {@link ZustikFieldState}. */
export type ZustikFieldRenderState<
  TValue,
  TName extends string = string,
> = ZustikFieldState<TValue, TName>;

export type ZustikManagedComponentProp =
  | "name"
  | "onBlur"
  | "onChange"
  | "onFocus"
  | "value";

export type PropsOf<TComponent extends ComponentType<any>> =
  ComponentPropsWithoutRef<TComponent>;

export type ZustikManagedKeys<TProps> = Extract<
  ZustikManagedComponentProp,
  keyof TProps
>;

type EventKeys<TKeys> = TKeys extends `on${string}` ? TKeys : never;

/** Static props supplied by the caller; form-controlled props are injected. */
export type ZustikComponentProps<TComponent extends ComponentType<any>> = Omit<
  PropsOf<TComponent>,
  ZustikManagedKeys<PropsOf<TComponent>> | "key" | "ref"
> &
  Partial<
    Pick<
      PropsOf<TComponent>,
      Extract<
        EventKeys<ZustikManagedKeys<PropsOf<TComponent>>>,
        keyof PropsOf<TComponent>
      >
    >
  >;

type HandlerArguments<
  TProps,
  TKey extends PropertyKey,
  TFallback extends readonly unknown[],
> = TKey extends keyof TProps
  ? NonNullable<TProps[TKey]> extends (...args: infer TArguments) => unknown
    ? TArguments
    : TFallback
  : TFallback;

export interface ZustikComponentBindingContext<
  TValues extends object,
  TName extends FieldPath<TValues>,
  TComponent extends ComponentType<any>,
> {
  /** The static field props supplied in the factory configuration. */
  readonly props: Readonly<
    Partial<Omit<PropsOf<TComponent>, "key" | "ref">>
  >;
  readonly field: ZustikFieldState<
    FieldPathValue<TValues, TName>,
    TName
  >;
  readonly input: ZustikFieldInput<FieldPathValue<TValues, TName>>;
  readonly values: Readonly<TValues>;
}

export interface ZustikBaseFieldDefinition<
  TValues extends object,
  TName extends FieldPath<TValues>,
> {
  /** Other values read by mapProps. */
  readonly dependsOn?: readonly FieldPath<TValues>[];
  readonly isEqual?: (
    previous: FieldPathValue<TValues, TName>,
    next: FieldPathValue<TValues, TName>,
  ) => boolean;
}

export interface ZustikHeadlessFieldDefinition<
  TValues extends object,
  TName extends FieldPath<TValues>,
> extends ZustikBaseFieldDefinition<TValues, TName> {
  readonly component?: undefined;
  readonly mapProps?: never;
  readonly props?: never;
  readonly renderKey?: never;
  /** Converts a spread component's onChange arguments into the field value. */
  readonly valueFromChange?: (
    ...args: readonly unknown[]
  ) => FieldPathValue<TValues, TName>;
}

type ComponentPropsProperty<TComponent extends ComponentType<any>> =
  Record<string, never> extends ZustikComponentProps<TComponent>
    ? { readonly props?: Readonly<ZustikComponentProps<TComponent>> }
    : { readonly props: Readonly<ZustikComponentProps<TComponent>> };

export type ZustikComponentFieldDefinition<
  TValues extends object,
  TName extends FieldPath<TValues>,
  TComponent extends ComponentType<any>,
> = ZustikBaseFieldDefinition<TValues, TName> & {
  readonly component: TComponent;
  readonly renderKey?: Key;
} &
  (
    | (ComponentPropsProperty<TComponent> & {
        readonly mapProps?: undefined;
        /** Converts the component's onChange arguments into the field value. */
        readonly valueFromChange?: (
          ...args: HandlerArguments<
            PropsOf<TComponent>,
            "onChange",
            readonly [FieldPathValue<TValues, TName>]
          >
        ) => FieldPathValue<TValues, TName>;
      })
    | {
        /** Optional static inputs consumed by mapProps. */
        readonly props?: Readonly<
          Partial<Omit<PropsOf<TComponent>, "key" | "ref">>
        >;
        /** Produces the complete props object for non-standard components. */
        readonly mapProps: (
          context: ZustikComponentBindingContext<
            TValues,
            TName,
            TComponent
          >,
        ) => PropsOf<TComponent>;
        readonly valueFromChange?: never;
      }
  );

export type ZustikFieldDefinition<
  TValues extends object,
  TName extends FieldPath<TValues> = FieldPath<TValues>,
  TComponent extends ComponentType<any> = ComponentType<any>,
> =
  | ZustikHeadlessFieldDefinition<TValues, TName>
  | ZustikComponentFieldDefinition<TValues, TName, TComponent>;

type ZustikNestedErrors<TValue> = TValue extends readonly (infer TItem)[]
  ? readonly (ZustikNestedErrors<TItem> | undefined)[] & {
      readonly [ARRAY_ERROR]?: unknown;
    }
  : TValue extends object
    ? { readonly [TKey in keyof TValue]?: ZustikNestedErrors<TValue[TKey]> }
    : unknown;

/** Nested Final Form errors, including its form-level error key. */
export type ZustikFormErrors<TValue> = ZustikNestedErrors<TValue> & {
  readonly [FORM_ERROR]?: unknown;
};

export type ZustikSubmissionErrors<TValues extends object> =
  | SubmissionErrors
  | ZustikFormErrors<TValues>;

export type ZustikStoreSet<TStoreState extends object> =
  StoreApi<TStoreState>["setState"];

export type ZustikStoreGet<TStoreState extends object> =
  StoreApi<TStoreState>["getState"];

export type ZustikStoreApi<TStoreState extends object> = StoreApi<TStoreState>;

export interface ZustikStoreContext<TStoreState extends object> {
  /** The containing Zustand store's set function. */
  readonly set: ZustikStoreSet<TStoreState>;
  /** The containing Zustand store's get function. */
  readonly get: ZustikStoreGet<TStoreState>;
  /** The complete vanilla Zustand store API. */
  readonly store: ZustikStoreApi<TStoreState>;
}

export interface ZustikSubmitContext<
  TInput extends object,
  TPostfix extends string = string,
  TStoreState extends object = object,
> extends ZustikStoreContext<TStoreState> {
  readonly formApi: FormApi<TInput>;
  readonly formId: string;
  readonly formPostfix: TPostfix;
  readonly inputValues: Readonly<TInput>;
}

export interface ZustikResetContext<
  TInput extends object,
  TPostfix extends string = string,
  TStoreState extends object = object,
> extends ZustikStoreContext<TStoreState> {
  readonly formApi: FormApi<TInput>;
  readonly formId: string;
  readonly formPostfix: TPostfix;
  readonly initialValues: Readonly<TInput>;
  readonly previousValues: Readonly<TInput>;
}

export interface ZustikFormOptions {
  readonly destroyOnUnregister?: boolean;
  readonly keepDirtyOnReinitialize?: boolean;
  readonly validateOnBlur?: boolean;
}

interface ZustikFormDefinitionBase<
  TPostfix extends string,
  TInput extends object,
  TOutput,
  TFields extends Readonly<Record<string, object>>,
  TStoreState extends object,
> {
  readonly defaultValues: TInput;
  /** Field paths are the keys, so names never need to be repeated. */
  readonly fields: TFields;
  /** Stable HTML form ID. Defaults to `zustik-${formPostfix}`. */
  readonly formId?: string;
  readonly formPostfix: TPostfix;
  readonly onReset?: (
    context: ZustikResetContext<TInput, TPostfix, TStoreState>,
  ) => MaybePromise<void>;
  readonly onSubmit: (
    values: TOutput,
    context: ZustikSubmitContext<TInput, TPostfix, TStoreState>,
  ) => MaybePromise<ZustikSubmissionErrors<TInput> | void>;
  readonly options?: Readonly<ZustikFormOptions>;
}

export type ZustikFormDefinition<
  TPostfix extends string,
  TInput extends object,
  TOutput,
  TFields extends Readonly<Record<string, object>>,
  TSchema extends AnyZustikSchema | undefined,
  TStoreState extends object = object,
> = ZustikFormDefinitionBase<
  TPostfix,
  TInput,
  TOutput,
  TFields,
  TStoreState
> &
  (TSchema extends AnyZustikSchema
    ? { readonly validationSchema: TSchema }
    : { readonly validationSchema?: undefined });

export type SchemaInput<TSchema extends AnyZustikSchema> =
  InferInput<TSchema> extends object ? InferInput<TSchema> : never;

export type SchemaOutput<TSchema extends AnyZustikSchema> =
  InferOutput<TSchema>;

type AnyDefinition = {
  readonly defaultValues: object;
  readonly fields: Readonly<Record<string, object>>;
  readonly formPostfix: string;
};

type SliceOfDefinition<TDefinition> =
  TDefinition extends { readonly formPostfix: infer TPostfix extends string }
    ? {
        readonly [TKey in `zustikForm${TPostfix}`]: ZustikFormView<TDefinition>;
      }
    : never;

/** A reusable static Zustand slice creator for one configured form. */
export interface ZustikFormSliceFactory<
  TDefinition extends AnyDefinition,
  TStoreState extends object = object,
> {
  <TState extends TStoreState & SliceOfDefinition<TDefinition>>(
    setState: StoreApi<TState>["setState"],
    getState: StoreApi<TState>["getState"],
    store: StoreApi<TState>,
  ): SliceOfDefinition<TDefinition>;
}

export type DefinitionOf<TSource> =
  TSource extends ZustikFormSliceFactory<infer TDefinition, infer _TStoreState>
    ? TDefinition
    : TSource;

export type InputOf<TSource> =
  DefinitionOf<TSource> extends {
    readonly defaultValues: infer TInput extends object;
  }
    ? TInput
    : never;

export type OutputOf<TSource> =
  DefinitionOf<TSource> extends {
    readonly validationSchema: infer TSchema extends AnyZustikSchema;
  }
    ? InferOutput<TSchema>
    : InputOf<TSource>;

export type PostfixOf<TSource> =
  DefinitionOf<TSource> extends {
    readonly formPostfix: infer TPostfix extends string;
  }
    ? TPostfix
    : never;

export type FieldsOf<TSource> =
  DefinitionOf<TSource> extends {
    readonly fields: infer TFields extends Readonly<Record<string, object>>;
  }
    ? TFields
    : Readonly<Record<never, never>>;

export interface ZustikDefaultFieldProps<
  TValue,
  TName extends string = string,
> {
  readonly name: TName;
  readonly onBlur: (...args: readonly unknown[]) => void;
  readonly onChange: (...args: readonly unknown[]) => void;
  readonly onFocus: (...args: readonly unknown[]) => void;
  readonly value: TValue;
}

type FieldNameOf<TSource> = Extract<keyof FieldsOf<TSource>, string>;

type FieldValueOf<
  TSource,
  TName extends FieldNameOf<TSource>,
> = TName extends FieldPath<InputOf<TSource>>
  ? FieldPathValue<InputOf<TSource>, TName>
  : never;

type ResolvedPropsOf<
  TSource,
  TName extends FieldNameOf<TSource>,
> = FieldsOf<TSource>[TName] extends {
  readonly component: infer TComponent extends ComponentType<any>;
}
  ? PropsOf<TComponent>
  : ZustikDefaultFieldProps<FieldValueOf<TSource, TName>, TName>;

export interface ZustikFieldView<
  TValue,
  TProps extends object = ZustikDefaultFieldProps<TValue>,
  TName extends string = string,
> extends ZustikFieldState<TValue, TName>,
    ZustikFieldInput<TValue> {
  readonly component: ComponentType<any> | undefined;
  readonly element: ReactElement<TProps> | undefined;
  /** A mapper failure retained alongside the latest engine state. */
  readonly projectionError: unknown | undefined;
  readonly props: Readonly<TProps>;
}

export type ZustikFieldViewOf<
  TSource,
  TName extends FieldNameOf<TSource>,
> = ZustikFieldView<
  FieldValueOf<TSource, TName>,
  Extract<ResolvedPropsOf<TSource, TName>, object>,
  TName
>;

/** Field state and actions keyed directly by configured field path. */
export type ZustikFieldsView<TSource> = {
  readonly [TName in FieldNameOf<TSource>]: ZustikFieldViewOf<TSource, TName>;
};

/** Ready-to-spread props keyed directly by configured field path. */
export type ZustikFieldPropsView<TSource> = {
  readonly [TName in FieldNameOf<TSource>]: Readonly<
    Extract<ResolvedPropsOf<TSource, TName>, object>
  >;
};

/** Ready-to-render React elements for component-backed fields only. */
export type ZustikComponentsView<TSource> = {
  readonly [TName in FieldNameOf<TSource> as FieldsOf<TSource>[TName] extends {
    readonly component: ComponentType<any>;
  }
    ? TName
    : never]: FieldsOf<TSource>[TName] extends {
    readonly component: infer TComponent extends ComponentType<any>;
  }
    ? ReactElement<PropsOf<TComponent>>
    : never;
};

/** @deprecated `fields` is keyed in 0.2; use {@link ZustikFieldsView}. */
export type ZustikFieldsByName<TSource> = ZustikFieldsView<TSource>;

export interface ZustikPreventableEvent {
  preventDefault(): void;
}

export type ZustikSubmitResult<TInput extends object> =
  | {
      readonly errors: ZustikSubmissionErrors<TInput> | undefined;
      readonly status: "invalid" | "submission-error";
    }
  | { readonly status: "succeeded" };

export interface ZustikFormView<TSource> {
  readonly active: FieldPath<InputOf<TSource>> | undefined;
  /** Escape hatch to the form's vanilla Final Form instance. */
  readonly api: FormApi<InputOf<TSource>>;
  readonly components: ZustikComponentsView<TSource>;
  readonly dirty: boolean;
  readonly dirtyFields: Readonly<Record<string, boolean>>;
  readonly dirtyFieldsSinceLastSubmit: Readonly<Record<string, boolean>>;
  readonly dirtySinceLastSubmit: boolean;
  readonly error: unknown;
  readonly errors: ZustikFormErrors<InputOf<TSource>> | undefined;
  readonly fieldProps: ZustikFieldPropsView<TSource>;
  readonly fields: ZustikFieldsView<TSource>;
  readonly formId: string;
  /** Ready to spread onto a native `<form>`. */
  readonly formProps: {
    readonly id: string;
    readonly onReset: (event?: ZustikPreventableEvent) => Promise<void>;
    readonly onSubmit: (
      event?: ZustikPreventableEvent,
    ) => Promise<ZustikSubmitResult<InputOf<TSource>>>;
  };
  readonly formPostfix: PostfixOf<TSource>;
  readonly hasProjectionErrors: boolean;
  readonly hasSubmitErrors: boolean;
  readonly hasValidationErrors: boolean;
  readonly initialValues: Readonly<InputOf<TSource>>;
  readonly invalid: boolean;
  readonly modified: Readonly<Record<string, boolean>>;
  readonly modifiedSinceLastSubmit: boolean;
  readonly onReset: (event?: ZustikPreventableEvent) => Promise<void>;
  readonly onSubmit: (
    event?: ZustikPreventableEvent,
  ) => Promise<ZustikSubmitResult<InputOf<TSource>>>;
  readonly pristine: boolean;
  readonly projectionErrors: Readonly<Record<string, unknown>>;
  readonly reset: () => Promise<void>;
  readonly submit: () => Promise<ZustikSubmitResult<InputOf<TSource>>>;
  readonly submitError: unknown;
  readonly submitErrors: ZustikSubmissionErrors<InputOf<TSource>> | undefined;
  readonly submitFailed: boolean;
  readonly submitSucceeded: boolean;
  readonly submitting: boolean;
  readonly touched: Readonly<Record<string, boolean>>;
  readonly valid: boolean;
  readonly validating: boolean;
  readonly values: Readonly<InputOf<TSource>>;
  readonly visited: Readonly<Record<string, boolean>>;
  readonly blur: (name: FieldPath<InputOf<TSource>>) => void;
  readonly change: <TName extends FieldPath<InputOf<TSource>>>(
    name: TName,
    value: FieldPathValue<InputOf<TSource>, TName>,
  ) => void;
  readonly focus: (name: FieldPath<InputOf<TSource>>) => void;
  readonly initialize: (values: InputOf<TSource>) => void;
  readonly setValue: <TName extends FieldPath<InputOf<TSource>>>(
    name: TName,
    value: FieldPathValue<InputOf<TSource>, TName>,
  ) => void;
}

/** The single, always-present form state contributed by a static factory. */
export type ZustikFormSlice<TSource> = SliceOfDefinition<DefinitionOf<TSource>>;

interface LooseFieldBase {
  readonly dependsOn?: readonly string[];
  readonly isEqual?: (...args: readonly any[]) => boolean;
  readonly valueFromChange?: (...args: readonly any[]) => unknown;
}

type LooseFieldDefinition = LooseFieldBase &
  (
    | {
        readonly component: ComponentType<any>;
        readonly mapProps?: (...args: readonly any[]) => unknown;
        readonly props?: Readonly<Record<string, unknown>>;
        readonly renderKey?: Key;
      }
    | {
        readonly component?: undefined;
        readonly mapProps?: never;
        readonly props?: never;
        readonly renderKey?: never;
      }
  );

export type LooseFieldsDefinition = Readonly<
  Record<string, LooseFieldDefinition>
>;

/**
 * Curried builder used when form lifecycle callbacks need access to their
 * containing Zustand store. Use the smallest required store contract.
 */
export interface ZustikFormSliceBuilder<TStoreState extends object> {
  <
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
        TSchema,
        TStoreState
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
      TSchema,
      TStoreState
    >,
    TStoreState
  >;

  <
    const TPostfix extends string,
    TInput extends object,
    const TFields extends LooseFieldsDefinition,
  >(
    definition: Omit<
      ZustikFormDefinition<
        TPostfix,
        TInput,
        TInput,
        TFields,
        undefined,
        TStoreState
      >,
      "fields"
    > & {
      readonly fields: TFields;
    },
  ): ZustikFormSliceFactory<
    ZustikFormDefinition<
      TPostfix,
      TInput,
      TInput,
      TFields,
      undefined,
      TStoreState
    >,
    TStoreState
  >;
}

type ValidateField<
  TValues extends object,
  TName extends FieldPath<TValues>,
  TField extends LooseFieldDefinition,
> = TField extends {
  readonly component: infer TComponent extends ComponentType<any>;
}
  ? TField extends { readonly mapProps: (...args: readonly any[]) => unknown }
    ? TField & {
        readonly mapProps: (
          context: ZustikComponentBindingContext<
            TValues,
            TName,
            TComponent
          >,
        ) => PropsOf<TComponent>;
        readonly props?: Readonly<
          Partial<Omit<PropsOf<TComponent>, "key" | "ref">>
        >;
        readonly valueFromChange?: never;
      }
    : TField &
        ComponentPropsProperty<TComponent> & {
          readonly mapProps?: undefined;
          readonly valueFromChange?: (
            ...args: HandlerArguments<
              PropsOf<TComponent>,
              "onChange",
              readonly [FieldPathValue<TValues, TName>]
            >
          ) => FieldPathValue<TValues, TName>;
        }
  : TField & ZustikHeadlessFieldDefinition<TValues, TName>;

/** Internal validation shape used by createZustikFormSlice inference. */
export type ValidatedFields<
  TValues extends object,
  TFields extends LooseFieldsDefinition,
> = {
  readonly [TName in keyof TFields]: TName extends FieldPath<TValues>
    ? ValidateField<TValues, TName, TFields[TName]>
    : never;
};

export const ZUSTIK_FIELD_SUBSCRIPTION: Readonly<
  Required<FieldSubscription>
> = {
  active: true,
  data: true,
  dirty: true,
  dirtySinceLastSubmit: true,
  error: true,
  initial: true,
  invalid: true,
  length: true,
  modified: true,
  modifiedSinceLastSubmit: true,
  pristine: true,
  submitError: true,
  submitFailed: true,
  submitSucceeded: true,
  submitting: true,
  touched: true,
  valid: true,
  validating: true,
  value: true,
  visited: true,
};
