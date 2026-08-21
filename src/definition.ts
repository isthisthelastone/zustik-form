import type { ComponentType } from "react";

import type { AnyZustikSchema } from "./types.js";

const POSTFIX_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const FORM_ID_PATTERN = /^[A-Za-z][A-Za-z0-9:._-]*$/;
const FIELD_SEGMENT_PATTERN = /^(?:[A-Za-z_$][A-Za-z0-9_$]*|[0-9]+)$/;
const UNSAFE_FIELD_SEGMENTS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export interface RuntimeFieldDefinition {
  readonly component?: ComponentType<any>;
  readonly dependsOn?: readonly string[];
  readonly isEqual?: (previous: unknown, next: unknown) => boolean;
  readonly mapProps?: (context: {
    readonly field: unknown;
    readonly input: unknown;
    readonly props: Readonly<Record<string, unknown>>;
    readonly values: Readonly<Record<string, unknown>>;
  }) => Record<string, unknown>;
  readonly name: string;
  readonly props?: Readonly<Record<string, unknown>>;
  readonly renderKey?: string | number | bigint;
  readonly valueFromChange?: (...args: readonly unknown[]) => unknown;
}

export interface RuntimeDefinition {
  readonly defaultValues: Record<string, unknown>;
  readonly fields: readonly RuntimeFieldDefinition[];
  readonly formId: string;
  readonly formPostfix: string;
  readonly onReset?: (context: {
    readonly formApi: unknown;
    readonly formId: string;
    readonly formPostfix: string;
    readonly initialValues: Readonly<Record<string, unknown>>;
    readonly previousValues: Readonly<Record<string, unknown>>;
  }) => void | Promise<void>;
  readonly onSubmit: (
    values: unknown,
    context: {
      readonly formApi: unknown;
      readonly formId: string;
      readonly formPostfix: string;
      readonly inputValues: Readonly<Record<string, unknown>>;
    },
  ) => unknown;
  readonly options?: Readonly<{
    readonly destroyOnUnregister?: boolean;
    readonly keepDirtyOnReinitialize?: boolean;
    readonly validateOnBlur?: boolean;
  }>;
  readonly validationSchema?: AnyZustikSchema;
}

interface RawFieldDefinition {
  readonly component?: unknown;
  readonly dependsOn?: unknown;
  readonly isEqual?: unknown;
  readonly mapProps?: unknown;
  readonly props?: unknown;
  readonly renderKey?: unknown;
  readonly valueFromChange?: unknown;
}

interface RawDefinition {
  readonly defaultValues: Record<string, unknown>;
  readonly fields: Readonly<Record<string, RawFieldDefinition>>;
  readonly formId?: string;
  readonly formPostfix: string;
  readonly onReset?: unknown;
  readonly onSubmit: unknown;
  readonly options?: Readonly<Record<string, unknown>>;
  readonly validationSchema?: unknown;
}

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
      typeof current !== "object" ||
      current === null ||
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

function assertDefinitionShape(definition: RawDefinition): void {
  if (definition === null || typeof definition !== "object") {
    throw new TypeError("The form configuration must be an object.");
  }

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

  if (
    definition.fields === null ||
    typeof definition.fields !== "object" ||
    Array.isArray(definition.fields)
  ) {
    throw new TypeError("fields must be an object keyed by field path.");
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
  if (Object.prototype.hasOwnProperty.call(definition, "cloneValues")) {
    throw new TypeError(
      "cloneValues is not supported. Form values must be structured-cloneable.",
    );
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

  if (
    definition.validationSchema !== undefined &&
    (definition.validationSchema === null ||
      typeof definition.validationSchema !== "object" ||
      !("~run" in definition.validationSchema))
  ) {
    throw new TypeError("validationSchema must be a Valibot schema.");
  }
}

function assertFieldDefinition(
  name: string,
  field: RawFieldDefinition,
  defaultValues: object,
): void {
  if (name.length === 0) {
    throw new TypeError("Every field key must be a non-empty string.");
  }
  assertFieldPath(name, "field name");
  if (!hasOwnPath(defaultValues, name)) {
    throw new TypeError(
      `Field ${JSON.stringify(name)} does not exist in defaultValues.`,
    );
  }
  if (field === null || typeof field !== "object" || Array.isArray(field)) {
    throw new TypeError(
      `Field ${JSON.stringify(name)} must be configured with an object.`,
    );
  }

  if (
    field.component !== undefined &&
    typeof field.component !== "function" &&
    (typeof field.component !== "object" || field.component === null)
  ) {
    throw new TypeError(
      `component for ${JSON.stringify(name)} must be a React component.`,
    );
  }

  if (
    field.component === undefined &&
    (field.props !== undefined ||
      field.mapProps !== undefined ||
      field.renderKey !== undefined)
  ) {
    throw new TypeError(
      `props, mapProps, and renderKey for ${JSON.stringify(name)} require a component.`,
    );
  }

  if (
    field.props !== undefined &&
    (field.props === null ||
      typeof field.props !== "object" ||
      Array.isArray(field.props))
  ) {
    throw new TypeError(`props for ${JSON.stringify(name)} must be an object.`);
  }

  for (const [key, value] of [
    ["isEqual", field.isEqual],
    ["mapProps", field.mapProps],
    ["valueFromChange", field.valueFromChange],
  ] as const) {
    if (value !== undefined && typeof value !== "function") {
      throw new TypeError(
        `${key} for ${JSON.stringify(name)} must be a function.`,
      );
    }
  }

  if (field.mapProps !== undefined && field.valueFromChange !== undefined) {
    throw new TypeError(
      `valueFromChange cannot be combined with mapProps for ${JSON.stringify(name)}.`,
    );
  }

  if (field.dependsOn !== undefined) {
    if (
      !Array.isArray(field.dependsOn) ||
      field.dependsOn.some((path) => typeof path !== "string")
    ) {
      throw new TypeError(
        `dependsOn for ${JSON.stringify(name)} must be an array of field paths.`,
      );
    }
    if (field.mapProps === undefined) {
      throw new TypeError(
        `dependsOn for ${JSON.stringify(name)} requires mapProps.`,
      );
    }
    for (const path of field.dependsOn as readonly string[]) {
      assertFieldPath(path, "dependsOn path");
      if (!hasOwnPath(defaultValues, path)) {
        throw new TypeError(
          `Dependency ${JSON.stringify(path)} does not exist in defaultValues.`,
        );
      }
    }
  }
}

export function cloneZustikValues<TValues extends object>(
  values: Readonly<TValues>,
): TValues {
  let cloned: TValues;
  try {
    cloned = structuredClone(values);
  } catch (error) {
    throw new TypeError(
      "Could not clone form values. Form values must be structured-cloneable.",
      { cause: error },
    );
  }

  if (cloned === null || typeof cloned !== "object" || Array.isArray(cloned)) {
    throw new TypeError("Form values must be a non-null object.");
  }
  return cloned;
}

/** Validates and snapshots a user configuration for a static form factory. */
export function prepareZustikDefinition(
  rawDefinition: RawDefinition,
): RuntimeDefinition {
  assertDefinitionShape(rawDefinition);

  const defaultValues = cloneZustikValues(rawDefinition.defaultValues);
  const fields: RuntimeFieldDefinition[] = [];
  for (const [name, field] of Object.entries(rawDefinition.fields)) {
    assertFieldDefinition(name, field, defaultValues);
    fields.push({
      ...field,
      name,
      ...(field.props === undefined ? {} : { props: { ...field.props } }),
      ...(field.dependsOn === undefined
        ? {}
        : {
            dependsOn: [
              ...(field.dependsOn as readonly string[]),
            ] as readonly string[],
          }),
    } as RuntimeFieldDefinition);
  }

  const formId = rawDefinition.formId ?? `zustik-${rawDefinition.formPostfix}`;
  return {
    defaultValues,
    fields,
    formId,
    formPostfix: rawDefinition.formPostfix,
    ...(rawDefinition.onReset === undefined
      ? {}
      : {
          onReset: rawDefinition.onReset as Exclude<
            RuntimeDefinition["onReset"],
            undefined
          >,
        }),
    onSubmit: rawDefinition.onSubmit as RuntimeDefinition["onSubmit"],
    ...(rawDefinition.options === undefined
      ? {}
      : { options: { ...rawDefinition.options } }),
    ...(rawDefinition.validationSchema === undefined
      ? {}
      : {
          validationSchema:
            rawDefinition.validationSchema as AnyZustikSchema,
        }),
  };
}

/** Creates a fresh per-store copy from an already validated definition. */
export function clonePreparedZustikDefinition(
  definition: RuntimeDefinition,
): RuntimeDefinition {
  return {
    ...definition,
    defaultValues: cloneZustikValues(definition.defaultValues),
    fields: definition.fields.map((field) => ({
      ...field,
      ...(field.props === undefined ? {} : { props: { ...field.props } }),
      ...(field.dependsOn === undefined
        ? {}
        : { dependsOn: [...field.dependsOn] }),
    })),
    ...(definition.options === undefined
      ? {}
      : { options: { ...definition.options } }),
  };
}

export function valueFromEvent<TValue>(event: {
  readonly currentTarget: { readonly value: TValue };
}): TValue {
  return event.currentTarget.value;
}

export function checkedFromEvent(event: {
  readonly currentTarget: { readonly checked: boolean };
}): boolean {
  return event.currentTarget.checked;
}
