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

/** Resolves the value at a {@link FieldPath}. */
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

export interface ZustikFieldRenderState<
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

/** Props supplied by the caller. Form-controlled props are injected at runtime. */
export type ZustikComponentProps<
  TComponent extends ComponentType<any>,
  TControlled extends keyof PropsOf<TComponent> = ZustikManagedKeys<
    PropsOf<TComponent>
  >,
> = Omit<
  PropsOf<TComponent>,
  TControlled | "key" | "ref"
> &
  Partial<
    Pick<PropsOf<TComponent>, Extract<EventKeys<TControlled>, keyof PropsOf<TComponent>>>
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
  TControlled extends keyof PropsOf<TComponent> = ZustikManagedKeys<
    PropsOf<TComponent>
  >,
> {
  readonly componentProps: Readonly<
    ZustikComponentProps<TComponent, TControlled>
  >;
  readonly field: ZustikFieldRenderState<
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
  /** Other values that a custom component mapper reads. */
  readonly dependsOn?: readonly FieldPath<TValues>[];
  readonly isEqual?: (
    previous: FieldPathValue<TValues, TName>,
    next: FieldPathValue<TValues, TName>,
  ) => boolean;
  readonly name: TName;
}

export interface ZustikHeadlessFieldDefinition<
  TValues extends object,
  TName extends FieldPath<TValues>,
> extends ZustikBaseFieldDefinition<TValues, TName> {
  readonly component?: undefined;
}

type ComponentPropsProperty<
  TComponent extends ComponentType<any>,
  TControlled extends keyof PropsOf<TComponent>,
> = Record<string, never> extends ZustikComponentProps<
  TComponent,
  TControlled
>
    ? {
        readonly componentProps?: Readonly<
          ZustikComponentProps<TComponent, TControlled>
        >;
      }
    : {
        readonly componentProps: Readonly<
          ZustikComponentProps<TComponent, TControlled>
        >;
      };

export type ZustikComponentFieldDefinition<
  TValues extends object,
  TName extends FieldPath<TValues>,
  TComponent extends ComponentType<any>,
  TControlled extends keyof PropsOf<TComponent> = ZustikManagedKeys<
    PropsOf<TComponent>
  >,
> = ZustikBaseFieldDefinition<TValues, TName> &
  ComponentPropsProperty<TComponent, TControlled> & {
    readonly component: TComponent;
    readonly renderKey?: Key;
    /** Converts a component's onChange arguments into the field value. */
    readonly valueFromChange?: (
      ...args: HandlerArguments<
        PropsOf<TComponent>,
        "onChange",
        readonly [FieldPathValue<TValues, TName>]
      >
    ) => FieldPathValue<TValues, TName>;
  } &
  (
    | {
        readonly controlledProps?: undefined;
        /** Completely customizes the final props passed to the component. */
        readonly mapComponentProps?: (
          context: ZustikComponentBindingContext<
            TValues,
            TName,
            TComponent,
            TControlled
          >,
        ) => PropsOf<TComponent>;
      }
    | {
        /** Props produced by mapComponentProps instead of supplied by the caller. */
        readonly controlledProps: readonly TControlled[];
        /** Required when custom controlled props are declared. */
        readonly mapComponentProps: (
          context: ZustikComponentBindingContext<
            TValues,
            TName,
            TComponent,
            TControlled
          >,
        ) => PropsOf<TComponent>;
      }
  );

export type ZustikFieldDefinition<
  TValues extends object,
  TName extends FieldPath<TValues> = FieldPath<TValues>,
> =
  | ZustikHeadlessFieldDefinition<TValues, TName>
  | ZustikComponentFieldDefinition<
      TValues,
      TName,
      ComponentType<any>,
      any
    >;

/** Minimal structural constraint retained by heterogeneous field tuples. */
export interface ZustikNamedField<TValues extends object> {
  readonly name: FieldPath<TValues>;
}

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

export interface ZustikSubmitContext<
  TInput extends object,
  TPostfix extends string = string,
> {
  readonly formApi: FormApi<TInput>;
  readonly formId: string;
  readonly formPostfix: TPostfix;
  readonly inputValues: Readonly<TInput>;
}

export interface ZustikResetContext<
  TInput extends object,
  TPostfix extends string = string,
> {
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
  TFields extends readonly ZustikNamedField<TInput>[],
> {
  /** Overrides the default structured clone used to isolate initial values. */
  readonly cloneValues?: (values: Readonly<TInput>) => TInput;
  readonly defaultValues: TInput;
  readonly fields: TFields;
  /** Stable identifier. A per-store identifier is generated when omitted. */
  readonly formId?: string;
  readonly formPostfix: TPostfix;
  readonly onReset?: (
    context: ZustikResetContext<TInput, TPostfix>,
  ) => MaybePromise<void>;
  readonly onSubmit: (
    values: TOutput,
    context: ZustikSubmitContext<TInput, TPostfix>,
  ) => MaybePromise<ZustikSubmissionErrors<TInput> | void>;
  readonly options?: Readonly<ZustikFormOptions>;
}

export type ZustikFormDefinition<
  TPostfix extends string,
  TInput extends object,
  TOutput,
  TFields extends readonly ZustikNamedField<TInput>[],
  TSchema extends AnyZustikSchema | undefined,
> = ZustikFormDefinitionBase<TPostfix, TInput, TOutput, TFields> &
  (TSchema extends AnyZustikSchema
    ? { readonly validationSchema: TSchema }
    : { readonly validationSchema?: undefined });

export type InputOf<TDefinition> =
  TDefinition extends { readonly defaultValues: infer TInput extends object }
    ? TInput
    : never;

export type OutputOf<TDefinition> =
  TDefinition extends {
    readonly validationSchema: infer TSchema extends AnyZustikSchema;
  }
    ? InferOutput<TSchema>
    : InputOf<TDefinition>;

export type PostfixOf<TDefinition> = TDefinition extends {
  readonly formPostfix: infer TPostfix extends string;
}
  ? TPostfix
  : never;

export type FieldsOf<TDefinition> = TDefinition extends {
  readonly fields: infer TFields extends readonly unknown[];
}
  ? TFields
  : readonly [];

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

type FieldNameOf<TField> = TField extends { readonly name: infer TName }
  ? Extract<TName, string>
  : never;

type FieldValueOf<TDefinition, TField> = FieldNameOf<TField> extends infer TName
  ? TName extends FieldPath<InputOf<TDefinition>>
    ? FieldPathValue<InputOf<TDefinition>, TName>
    : never
  : never;

type ResolvedPropsOf<TDefinition, TField> = TField extends {
  readonly component: infer TComponent extends ComponentType<any>;
}
  ? PropsOf<TComponent>
  : ZustikDefaultFieldProps<
      FieldValueOf<TDefinition, TField>,
      FieldNameOf<TField>
    >;

export interface ZustikFieldView<
  TValue,
  TProps extends object = ZustikDefaultFieldProps<TValue>,
  TName extends string = string,
> extends ZustikFieldRenderState<TValue, TName>,
    ZustikFieldInput<TValue> {
  readonly component: ComponentType<any> | undefined;
  readonly element: ReactElement<TProps> | undefined;
  /** A mapper failure retained alongside the latest engine state. */
  readonly projectionError: unknown | undefined;
  readonly props: Readonly<TProps>;
}

export type ZustikFieldViewOf<TDefinition, TField> = ZustikFieldView<
  FieldValueOf<TDefinition, TField>,
  Extract<ResolvedPropsOf<TDefinition, TField>, object>,
  FieldNameOf<TField>
>;

export type ZustikFieldsView<TDefinition> = {
  readonly [TIndex in keyof FieldsOf<TDefinition>]: ZustikFieldViewOf<
    TDefinition,
    FieldsOf<TDefinition>[TIndex]
  >;
};

export type ZustikFieldsByName<TDefinition> = {
  readonly [TField in FieldsOf<TDefinition>[number] as FieldNameOf<TField>]: ZustikFieldViewOf<
    TDefinition,
    TField
  >;
};

export interface ZustikPreventableEvent {
  preventDefault(): void;
}

export type ZustikSubmitResult<TInput extends object> =
  | { readonly status: "destroyed" }
  | {
      readonly errors: ZustikSubmissionErrors<TInput> | undefined;
      readonly status: "invalid" | "submission-error";
    }
  | { readonly status: "succeeded" };

export interface ZustikFormView<TDefinition> {
  readonly active: FieldPath<InputOf<TDefinition>> | undefined;
  readonly components: readonly ReactElement[];
  readonly dirty: boolean;
  readonly dirtyFields: Readonly<Record<string, boolean>>;
  readonly dirtyFieldsSinceLastSubmit: Readonly<Record<string, boolean>>;
  readonly dirtySinceLastSubmit: boolean;
  readonly error: unknown;
  readonly errors: ZustikFormErrors<InputOf<TDefinition>> | undefined;
  readonly fields: ZustikFieldsView<TDefinition>;
  readonly fieldsByName: ZustikFieldsByName<TDefinition>;
  readonly formId: string;
  readonly formPostfix: PostfixOf<TDefinition>;
  readonly hasSubmitErrors: boolean;
  readonly hasValidationErrors: boolean;
  readonly hasProjectionErrors: boolean;
  readonly initialValues: Readonly<InputOf<TDefinition>>;
  readonly invalid: boolean;
  readonly modified: Readonly<Record<string, boolean>>;
  readonly modifiedSinceLastSubmit: boolean;
  readonly onReset: (event?: ZustikPreventableEvent) => Promise<void>;
  readonly onSubmit: (
    event?: ZustikPreventableEvent,
  ) => Promise<ZustikSubmitResult<InputOf<TDefinition>>>;
  readonly pristine: boolean;
  readonly projectionErrors: Readonly<Record<string, unknown>>;
  readonly reset: () => Promise<void>;
  readonly submit: () => Promise<ZustikSubmitResult<InputOf<TDefinition>>>;
  readonly submitError: unknown;
  readonly submitErrors: ZustikSubmissionErrors<InputOf<TDefinition>> | undefined;
  readonly submitFailed: boolean;
  readonly submitSucceeded: boolean;
  readonly submitting: boolean;
  readonly touched: Readonly<Record<string, boolean>>;
  readonly valid: boolean;
  readonly validating: boolean;
  readonly values: Readonly<InputOf<TDefinition>>;
  readonly visited: Readonly<Record<string, boolean>>;
  readonly blur: (name: FieldPath<InputOf<TDefinition>>) => void;
  readonly change: <TName extends FieldPath<InputOf<TDefinition>>>(
    name: TName,
    value: FieldPathValue<InputOf<TDefinition>, TName>,
  ) => void;
  readonly focus: (name: FieldPath<InputOf<TDefinition>>) => void;
  readonly initialize: (values: InputOf<TDefinition>) => void;
}

export interface ZustikFormSlot<TDefinition> {
  readonly form: ZustikFormView<TDefinition>;
}

export interface ZustikCreateFormOptions {
  /** Dispose and atomically replace a form with the same postfix. */
  readonly replace?: boolean;
}

type RegistryKey<TRegistry> = Extract<keyof TRegistry, string>;

type RegisteredDefinition<
  TRegistry,
  TKey extends RegistryKey<TRegistry>,
> = TRegistry[TKey] extends { readonly formPostfix: TKey }
  ? TRegistry[TKey]
  : never;

export type RegisteredDefinitionUnion<TRegistry> = {
  [TKey in RegistryKey<TRegistry>]: RegisteredDefinition<TRegistry, TKey>;
}[RegistryKey<TRegistry>];

type SlotState<TRegistry> = {
  readonly [TKey in RegistryKey<TRegistry> as `zustikForm${TKey}`]?:
    | ZustikFormSlot<RegisteredDefinition<TRegistry, TKey>>
    | undefined;
};

type CreateFormAction<TRegistry> = <
  TDefinition extends RegisteredDefinitionUnion<TRegistry>,
>(
  definition: TDefinition,
  options?: ZustikCreateFormOptions,
) => ZustikFormSlot<TDefinition>;

type DestroyFormAction<TRegistry> = (
  formPostfix: RegistryKey<TRegistry>,
) => boolean;

type DisposeFormsAction = () => void;

type GetFormApiAction<TRegistry> = <TKey extends RegistryKey<TRegistry>>(
  formPostfix: TKey,
) => FormApi<InputOf<RegisteredDefinition<TRegistry, TKey>>> | undefined;

type HasFormAction<TRegistry> = (
  formPostfix: RegistryKey<TRegistry>,
) => boolean;

type ControlActions<TRegistry, TActionPostfix extends string> = {
  readonly [TKey in `createForm${TActionPostfix}`]: CreateFormAction<TRegistry>;
} & {
  readonly [TKey in `destroyForm${TActionPostfix}`]: DestroyFormAction<TRegistry>;
} & {
  readonly [TKey in `disposeForms${TActionPostfix}`]: DisposeFormsAction;
} & {
  readonly [TKey in `getFormApi${TActionPostfix}`]: GetFormApiAction<TRegistry>;
} & {
  readonly [TKey in `hasForm${TActionPostfix}`]: HasFormAction<TRegistry>;
};

/** The dynamic form slots and manager commands contributed to a Zustand store. */
export type ZustikFormSlice<
  TRegistry extends object,
  TActionPostfix extends string = "",
> = SlotState<TRegistry> & ControlActions<TRegistry, TActionPostfix>;

export type SchemaInput<TSchema extends AnyZustikSchema> =
  InferInput<TSchema> extends object ? InferInput<TSchema> : never;

export type SchemaOutput<TSchema extends AnyZustikSchema> =
  InferOutput<TSchema>;

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
