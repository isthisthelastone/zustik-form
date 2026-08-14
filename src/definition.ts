import type { ComponentType } from "react";

import type {
  AnyZustikSchema,
  FieldPath,
  SchemaInput,
  SchemaOutput,
  ZustikComponentFieldDefinition,
  ZustikFieldDefinition,
  ZustikFormDefinition,
  ZustikHeadlessFieldDefinition,
  ZustikNamedField,
} from "./types.js";

const POSTFIX_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const FORM_ID_PATTERN = /^[A-Za-z][A-Za-z0-9:._-]*$/;
const FIELD_SEGMENT_PATTERN = /^(?:[A-Za-z_$][A-Za-z0-9_$]*|[0-9]+)$/;
const UNSAFE_FIELD_SEGMENTS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function assertFieldPath(path: string, label: string): void {
  const segments = path.split(".");
  if (
    segments.some(
      (segment) =>
        !FIELD_SEGMENT_PATTERN.test(segment) ||
        UNSAFE_FIELD_SEGMENTS.has(segment),
    )
  ) {
    throw new TypeError(
      `${label} must be a safe dot-separated property path (received ${JSON.stringify(path)}).`,
    );
  }
}

function hasOwnPath(values: object, path: string): boolean {
  let current: unknown = values;
  for (const segment of path.split(".")) {
    if (
      (typeof current !== "object" || current === null) ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return false;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return true;
}

export function assertZustikPostfix(postfix: string, label: string): void {
  if (!POSTFIX_PATTERN.test(postfix)) {
    throw new TypeError(
      `${label} must be a non-empty ASCII identifier (received ${JSON.stringify(postfix)}).`,
    );
  }
}

export function assertZustikDefinition(
  definition: {
    readonly defaultValues: object;
    readonly fields: readonly { readonly name: string }[];
    readonly formId?: string;
    readonly formPostfix: string;
    readonly cloneValues?: unknown;
    readonly onReset?: unknown;
    readonly onSubmit: unknown;
    readonly options?: Readonly<Record<string, unknown>>;
  },
): void {
  assertZustikPostfix(definition.formPostfix, "formPostfix");

  if (
    definition.formId !== undefined &&
    !FORM_ID_PATTERN.test(definition.formId)
  ) {
    throw new TypeError(
      `formId must be a non-empty, HTML-safe identifier (received ${JSON.stringify(definition.formId)}).`,
    );
  }

  if (
    definition.defaultValues === null ||
    typeof definition.defaultValues !== "object" ||
    Array.isArray(definition.defaultValues)
  ) {
    throw new TypeError("defaultValues must be a non-null object.");
  }

  if (!Array.isArray(definition.fields)) {
    throw new TypeError("fields must be an array.");
  }

  if (typeof definition.onSubmit !== "function") {
    throw new TypeError("onSubmit must be a function.");
  }
  if (
    definition.onReset !== undefined &&
    typeof definition.onReset !== "function"
  ) {
    throw new TypeError("onReset must be a function when provided.");
  }
  if (
    definition.cloneValues !== undefined &&
    typeof definition.cloneValues !== "function"
  ) {
    throw new TypeError("cloneValues must be a function when provided.");
  }
  if (definition.options !== undefined) {
    if (
      definition.options === null ||
      typeof definition.options !== "object" ||
      Array.isArray(definition.options)
    ) {
      throw new TypeError("options must be an object when provided.");
    }
    for (const key of [
      "destroyOnUnregister",
      "keepDirtyOnReinitialize",
      "validateOnBlur",
    ] as const) {
      const value = definition.options[key];
      if (value !== undefined && typeof value !== "boolean") {
        throw new TypeError(`${key} must be a boolean when provided.`);
      }
    }
  }

  const names = new Set<string>();
  for (const field of definition.fields) {
    if (
      field === null ||
      typeof field !== "object" ||
      typeof field.name !== "string" ||
      field.name.length === 0
    ) {
      throw new TypeError("Every field must have a non-empty string name.");
    }

    assertFieldPath(field.name, "field name");
    if (!hasOwnPath(definition.defaultValues, field.name)) {
      throw new TypeError(
        `Field ${JSON.stringify(field.name)} does not exist in defaultValues.`,
      );
    }

    if (names.has(field.name)) {
      throw new TypeError(`Duplicate field name ${JSON.stringify(field.name)}.`);
    }
    names.add(field.name);

    const runtimeField = field as {
      readonly component?: unknown;
      readonly componentProps?: unknown;
      readonly controlledProps?: unknown;
      readonly dependsOn?: unknown;
      readonly isEqual?: unknown;
      readonly mapComponentProps?: unknown;
      readonly valueFromChange?: unknown;
    };
    if (
      runtimeField.component !== undefined &&
      typeof runtimeField.component !== "function" &&
      (typeof runtimeField.component !== "object" ||
        runtimeField.component === null)
    ) {
      throw new TypeError(
        `component for ${JSON.stringify(field.name)} must be a React component.`,
      );
    }
    if (
      runtimeField.component === undefined &&
      (runtimeField.componentProps !== undefined ||
        runtimeField.controlledProps !== undefined ||
        runtimeField.mapComponentProps !== undefined ||
        runtimeField.valueFromChange !== undefined)
    ) {
      throw new TypeError(
        `Component binding options for ${JSON.stringify(field.name)} require a component.`,
      );
    }
    if (
      runtimeField.componentProps !== undefined &&
      (runtimeField.componentProps === null ||
        typeof runtimeField.componentProps !== "object" ||
        Array.isArray(runtimeField.componentProps))
    ) {
      throw new TypeError(
        `componentProps for ${JSON.stringify(field.name)} must be an object.`,
      );
    }
    for (const [key, value] of [
      ["isEqual", runtimeField.isEqual],
      ["mapComponentProps", runtimeField.mapComponentProps],
      ["valueFromChange", runtimeField.valueFromChange],
    ] as const) {
      if (value !== undefined && typeof value !== "function") {
        throw new TypeError(
          `${key} for ${JSON.stringify(field.name)} must be a function.`,
        );
      }
    }
    if (runtimeField.dependsOn !== undefined) {
      if (
        !Array.isArray(runtimeField.dependsOn) ||
        runtimeField.dependsOn.some((path) => typeof path !== "string")
      ) {
        throw new TypeError(
          `dependsOn for ${JSON.stringify(field.name)} must be an array of field paths.`,
        );
      }
      for (const path of runtimeField.dependsOn as readonly string[]) {
        assertFieldPath(path, "dependsOn path");
        if (!hasOwnPath(definition.defaultValues, path)) {
          throw new TypeError(
            `Dependency ${JSON.stringify(path)} does not exist in defaultValues.`,
          );
        }
      }
    }
    if (runtimeField.controlledProps !== undefined) {
      if (
        !Array.isArray(runtimeField.controlledProps) ||
        runtimeField.controlledProps.length === 0 ||
        runtimeField.controlledProps.some(
          (prop) => typeof prop !== "string" || prop.length === 0,
        )
      ) {
        throw new TypeError(
          `controlledProps for ${JSON.stringify(field.name)} must be a non-empty array of prop names.`,
        );
      }
      if (typeof runtimeField.mapComponentProps !== "function") {
        throw new TypeError(
          `mapComponentProps is required when controlledProps are declared for ${JSON.stringify(field.name)}.`,
        );
      }
    }
  }
}

export function cloneZustikValues<TValues extends object>(
  values: Readonly<TValues>,
  cloneValues?: (values: Readonly<TValues>) => TValues,
): TValues {
  let cloned: TValues;
  try {
    cloned =
      cloneValues === undefined
        ? structuredClone(values)
        : cloneValues(values);
  } catch (error) {
    throw new TypeError(
      "Could not clone form values. Provide cloneValues for values that are not structured-cloneable.",
      { cause: error },
    );
  }

  if (cloned === null || typeof cloned !== "object" || Array.isArray(cloned)) {
    throw new TypeError("cloneValues must return a non-null object.");
  }
  return cloned;
}

export interface ZustikFieldBuilder<TValues extends object> {
  <const TName extends FieldPath<TValues>>(
    definition: ZustikHeadlessFieldDefinition<TValues, TName>,
  ): ZustikHeadlessFieldDefinition<TValues, TName>;

  <
    const TName extends FieldPath<TValues>,
    const TComponent extends ComponentType<any>,
    const TControlled extends keyof import("./types.js").PropsOf<TComponent> =
      Extract<
        "name" | "onBlur" | "onChange" | "onFocus" | "value",
        keyof import("./types.js").PropsOf<TComponent>
      >,
  >(
    definition: ZustikComponentFieldDefinition<
      TValues,
      TName,
      TComponent,
      TControlled
    >,
  ): ZustikComponentFieldDefinition<
    TValues,
    TName,
    TComponent,
    TControlled
  >;
}

/**
 * Creates a field builder bound to a form value type. The function is an
 * identity at runtime and exists to preserve field names and component props.
 */
export function defineZustikField<
  TValues extends object,
>(): ZustikFieldBuilder<TValues> {
  return ((definition: unknown) => definition) as ZustikFieldBuilder<TValues>;
}

export function defineZustikForm<
  const TPostfix extends string,
  const TSchema extends AnyZustikSchema,
  const TFields extends readonly ZustikNamedField<SchemaInput<TSchema>>[],
>(
  definition: ZustikFormDefinition<
    TPostfix,
    SchemaInput<TSchema>,
    SchemaOutput<TSchema>,
    TFields,
    TSchema
  > & { readonly validationSchema: TSchema },
): ZustikFormDefinition<
  TPostfix,
  SchemaInput<TSchema>,
  SchemaOutput<TSchema>,
  TFields,
  TSchema
>;

export function defineZustikForm<
  const TPostfix extends string,
  TInput extends object,
  const TFields extends readonly ZustikNamedField<TInput>[],
>(
  definition: ZustikFormDefinition<
    TPostfix,
    TInput,
    TInput,
    TFields,
    undefined
  >,
): ZustikFormDefinition<
  TPostfix,
  TInput,
  TInput,
  TFields,
  undefined
>;

export function defineZustikForm(
  definition: any,
): any {
  assertZustikDefinition(definition);

  return {
    ...definition,
    defaultValues: cloneZustikValues(
      definition.defaultValues,
      definition.cloneValues,
    ),
    fields: definition.fields.map((field: {
      readonly componentProps?: Readonly<Record<string, unknown>>;
      readonly dependsOn?: readonly string[];
      readonly [key: string]: unknown;
    }) => ({
      ...field,
      ...(field.componentProps === undefined
        ? {}
        : { componentProps: { ...field.componentProps } }),
      ...(field.dependsOn === undefined
        ? {}
        : { dependsOn: [...field.dependsOn] }),
    })),
    ...(definition.options === undefined
      ? {}
      : { options: { ...definition.options } }),
  };
}

/** Extracts `currentTarget.value` from a DOM or MUI-style change event. */
export function valueFromEvent<TValue>(event: {
  readonly currentTarget: { readonly value: TValue };
}): TValue {
  return event.currentTarget.value;
}

/** Extracts `currentTarget.checked` from a checkbox-style change event. */
export function checkedFromEvent(event: {
  readonly currentTarget: { readonly checked: boolean };
}): boolean {
  return event.currentTarget.checked;
}
