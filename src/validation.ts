import { FORM_ERROR, getIn, setIn } from "final-form";
import {
  getDotPath,
  safeParse,
  safeParseAsync,
  type BaseIssue,
} from "valibot";

import type { AnyZustikSchema } from "./types.js";

export function issuesToFinalFormErrors(
  issues: readonly BaseIssue<unknown>[],
): Record<string, unknown> {
  let errors: Record<string, unknown> = {};

  for (const issue of issues) {
    const path = getDotPath(issue);
    if (path === null || path.length === 0) {
      if (errors[FORM_ERROR] === undefined) {
        errors = { ...errors, [FORM_ERROR]: issue.message };
      }
      continue;
    }

    if (getIn(errors, path) === undefined) {
      errors = setIn(errors, path, issue.message) as Record<string, unknown>;
    }
  }

  return errors;
}

export function validateWithSchema(
  schema: AnyZustikSchema,
  values: unknown,
):
  | Promise<Record<string, unknown> | undefined>
  | Record<string, unknown>
  | undefined {
  if (schema.async) {
    return safeParseAsync(schema, values).then(
      (result) =>
        result.success ? undefined : issuesToFinalFormErrors(result.issues),
      (error: unknown) => ({ [FORM_ERROR]: error }),
    );
  }

  try {
    const result = safeParse(schema, values);
    return result.success
      ? undefined
      : issuesToFinalFormErrors(result.issues);
  } catch (error) {
    return { [FORM_ERROR]: error };
  }
}

export type SchemaParseResult =
  | { readonly output: unknown; readonly success: true }
  | {
      readonly errors: Record<string, unknown>;
      readonly success: false;
    };

export async function parseWithSchema(
  schema: AnyZustikSchema,
  values: unknown,
): Promise<SchemaParseResult> {
  let result;
  try {
    result = schema.async
      ? await safeParseAsync(schema, values)
      : safeParse(schema, values);
  } catch (error) {
    return {
      errors: { [FORM_ERROR]: error },
      success: false,
    };
  }

  if (result.success) {
    return { output: result.output, success: true };
  }

  return {
    errors: issuesToFinalFormErrors(result.issues),
    success: false,
  };
}
