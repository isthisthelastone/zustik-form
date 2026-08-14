# zustik-form

Typed, dynamic form view-models for Zustand, powered by vanilla Final Form,
Valibot, and `React.createElement`.

`zustik-form` is a form-slice factory for applications that want form state to
live beside the rest of their Zustand state without adopting a React-specific
form runtime. A form definition is registered at runtime, backed by a vanilla
Final Form instance, validated by Valibot, and projected into a fully typed
Zustand slot such as `zustikFormComment`.

The library itself has no hooks, effects, context provider, component wrapper,
or mount/unmount lifecycle. It creates immutable React element descriptions for
component-backed fields; your application decides when forms are created,
rendered, replaced, reset, and destroyed.

## Requirements

- React **exactly 18.3.1**. This is the current peer requirement.
- Zustand `>=5.0.0 <6.0.0`.
- Node.js 18 or newer for Node-based use, builds, and tests.
- ESM. Use `import`; CommonJS `require()` is not supported.
- TypeScript 5.0 or newer for the published declarations. The project is built
  and tested with TypeScript 7.0.2.
- A runtime with `structuredClone` when the default value-cloning behavior is
  used. A custom `cloneValues` function can be supplied for other value types.

## Installation

```sh
pnpm add zustik-form react@18.3.1 zustand@^5 valibot
```

Final Form is an internal dependency. Valibot is listed explicitly above
because application code normally imports it to author schemas.

## Architecture

The design follows an MVVM-like split:

```text
Form definition
  fields, defaults, schema, callbacks, components
                         |
                         v
Model
  vanilla Final Form + Valibot validation
                         |
                         v
View-model
  Zustand slot: values, metadata, typed commands, field views, React elements
                         |
                         v
View
  your React markup, components, or headless bindings
```

- **Model:** Final Form owns form values, field registration, metadata,
  validation state, submission state, and reset behavior. Valibot supplies
  synchronous or asynchronous validation and typed submission output.
- **View-model:** `zustikFormCreate()` contributes manager actions to your store.
  Calling `createForm()` creates a dynamic slot named from `formPostfix`.
- **View:** component-backed fields are described with `React.createElement`.
  Headless field state and handlers are available for custom rendering.

There is no second React state machine and no React lifecycle hidden inside the
library. The ordinary Zustand hook in the examples below belongs to the
application, not to `zustik-form`.

## Typed quick start

### 1. Define a component and form

Use `defineZustikField<T>()` when component props and field values should be
checked together. `defineZustikForm()` preserves the form postfix, field tuple,
Valibot input, and Valibot output types.

```tsx
import type {
  ChangeEvent,
  ComponentType,
  FocusEvent,
} from "react";
import * as v from "valibot";

import {
  defineZustikField,
  defineZustikForm,
  valueFromEvent,
} from "zustik-form";

const CommentSchema = v.object({
  comment: v.pipe(
    v.string(),
    v.transform((value) => value.trim()),
    v.minLength(1, "A comment is required"),
    v.maxLength(256, "Use at most 256 characters"),
  ),
});

type CommentInput = v.InferInput<typeof CommentSchema>;

interface TextFieldProps {
  fullWidth: boolean;
  label: string;
  name: string;
  value: string;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
}

const TextField: ComponentType<TextFieldProps> = ({
  fullWidth,
  label,
  ...inputProps
}) => (
  <label style={{ display: fullWidth ? "block" : "inline-block" }}>
    {label}
    <input {...inputProps} />
  </label>
);

const commentField = defineZustikField<CommentInput>();

export const commentDefinition = defineZustikForm({
  formId: "comment-form",
  formPostfix: "Comment",
  validationSchema: CommentSchema,
  defaultValues: {
    comment: "",
  },
  fields: [
    commentField({
      name: "comment",
      component: TextField,
      componentProps: {
        fullWidth: true,
        label: "Comment",
      },
      valueFromChange: valueFromEvent,
    }),
  ] as const,
  onSubmit: async (values, context) => {
    // `values.comment` is the trimmed Valibot output.
    // `context.inputValues.comment` is the untransformed form input.
    console.log(values, context.inputValues, context.formId);
  },
  onReset: ({ previousValues }) => {
    // This additional action runs after reset state is visible in Zustand.
    console.log("Reset previous values", previousValues);
  },
});
```

The component's controlled `name`, `value`, `onChange`, `onBlur`, and `onFocus`
props are injected by the library. All other required component props must be
provided through `componentProps`.

### 2. Compose the form slice into a store

The registry is the source of compile-time knowledge about dynamic slots. A
registry key must match that definition's literal `formPostfix`.

```ts
import { create } from "zustand";

import {
  zustikFormCreate,
  type ZustikFormSlice,
} from "zustik-form";

import { commentDefinition } from "./comment-form.js";

interface Forms {
  Comment: typeof commentDefinition;
}

type AppState = ZustikFormSlice<Forms> & {
  count: number;
  increment(): void;
  initializeForms(): void;
};

const createFormsSlice = zustikFormCreate<Forms, AppState>();

export const useOurStore = create<AppState>()((set, get, store) => ({
  ...createFormsSlice(set, get, store),
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
  initializeForms: () => {
    if (!get().hasForm("Comment")) {
      get().createForm(commentDefinition);
    }
  },
}));
```

Create forms after the Zustand store itself exists. For a client-only singleton
store, application bootstrap can be as simple as:

```ts
useOurStore.getState().initializeForms();
```

For SSR, create and initialize a fresh store per request instead. See
[SSR and hydration](#ssr-and-hydration).

### 3. Render the projected elements

The dynamic slot is optional because it does not exist until `createForm()` is
called.

```tsx
import { useOurStore } from "./store.js";

export function CommentForm() {
  const form = useOurStore((state) => state.zustikFormComment?.form);

  if (form === undefined) return null;

  return (
    <form
      id={form.formId}
      onReset={form.onReset}
      onSubmit={form.onSubmit}
    >
      {form.components}

      {form.fieldsByName.comment.touched &&
      form.fieldsByName.comment.error !== undefined ? (
        <p role="alert">{String(form.fieldsByName.comment.error)}</p>
      ) : null}

      <button type="submit" disabled={form.submitting}>
        {form.submitting ? "Submitting…" : "Submit"}
      </button>
      <button type="reset">Reset</button>
    </form>
  );
}
```

`components` is already an ordered array of keyed React elements. It contains
only fields that supplied a component. `React.createElement` creates the element
descriptions; it does not invoke or mount the field component.

## Dynamic names and form IDs

### `formPostfix`

`formPostfix` determines both registry identity and the dynamic Zustand key:

| `formPostfix` | Zustand slot |
| --- | --- |
| `"Comment"` | `zustikFormComment` |
| `"groceryFields"` | `zustikFormgroceryFields` |

The value is concatenated exactly; its case is not changed. It must match
`^[A-Za-z][A-Za-z0-9]*$`: a non-empty ASCII identifier beginning with a letter.
PascalCase is recommended when it makes generated names easier to read, but it
is not required.

Duplicate live postfixes are rejected unless explicit replacement is requested.
Creation is also rejected if the generated Zustand key is already occupied by
another part of the store, even when that foreign property currently contains
`undefined`. Do not predeclare dynamic slot keys; the manager reserves and
creates them itself.

### `formId`

`formId` is a stable ID for a single live form runtime. The library exposes it;
it does not render a `<form>` element or apply the ID automatically:

```tsx
<form id={form.formId} onSubmit={form.onSubmit}>
  {form.components}
</form>

<button type="submit" form={form.formId}>
  Submit from outside the form
</button>
```

An explicit ID must match `^[A-Za-z][A-Za-z0-9:._-]*$`. IDs are unique within
one form-slice manager. Reusing the same ID for another live postfix throws.

When `formId` is omitted, the manager generates:

```text
zustik-<formPostfix>-<generation>
```

For example, the first `Comment` form is normally `zustik-Comment-1`.

Generated IDs are per manager, not globally unique across stores. They can also
change when a form is destroyed and recreated or replaced. Supply an explicit
ID when:

- two store instances can render into the same document;
- server and client creation order might differ;
- another element or external system needs a stable reference;
- a replacement must retain the same ID.

The resolved ID is available as `form.formId` and in both submit and reset
callback contexts.

## Fields

Every configured field is registered with Final Form when its form is created.
Fields support dot paths and array indices, with TypeScript path inference
capped at five nested levels for compiler performance.

Each form exposes:

- `fields`: the ordered, typed tuple corresponding to the definition;
- `fieldsByName`: the same field views keyed by literal field path;
- `components`: the ordered React elements for component-backed fields only.

A field view includes its current `value`, validation and submission errors,
focus/touch/dirty metadata, array `length`, direct `onChange(value)`, `onBlur()`,
and `onFocus()` handlers, resolved `props`, optional `component`, and optional
`element`. Every configured field path must exist in `defaultValues`. Runtime
paths use safe dot-separated identifier or numeric segments, such as
`profile.displayName` or `items.0.name`.

### Headless fields

A field without `component` is headless. Its `element` is `undefined`, but its
typed state and handlers remain available:

Assume the store registry contains a `Profile` definition with a headless
`profile.displayName` field:

```tsx
function DisplayNameInput() {
  const field = useOurStore(
    (state) =>
      state.zustikFormProfile?.form.fieldsByName["profile.displayName"],
  );

  if (field === undefined) return null;

  return (
    <label>
      Display name
      <input
        name={field.name}
        value={field.value}
        onChange={(event) => field.onChange(event.currentTarget.value)}
        onFocus={field.onFocus}
        onBlur={field.onBlur}
      />
      {field.touched && field.error !== undefined ? (
        <span role="alert">{String(field.error)}</span>
      ) : null}
    </label>
  );
}
```

Headless bindings are useful for native inputs, design-system adapters, render
props, non-React consumers of the Zustand store, and cases where the view must
control markup precisely.

### Default component binding

Without `mapComponentProps`, `zustik-form` starts with `componentProps` and then
injects these managed props:

- `name`;
- current `value`;
- `onChange`;
- `onBlur`;
- `onFocus`.

Managed props cannot be replaced by a value in `componentProps`. User-supplied
event callbacks are composed: Final Form updates first, then the callback in
`componentProps` runs. A callback can therefore read the already-updated store.

The default `onChange` accepts either a raw value or an event-like first
argument. For an event it reads `currentTarget` first, then `target`. Checkbox
inputs use `checked`; radio and other targets use `value`.

For an explicit and type-safe conversion, supply `valueFromChange`:

```ts
import { checkedFromEvent, valueFromEvent } from "zustik-form";

commentField({
  name: "comment",
  component: TextField,
  componentProps: { fullWidth: true, label: "Comment" },
  valueFromChange: valueFromEvent,
});

// `checkedFromEvent` performs the corresponding boolean extraction.
```

### Custom component mapping

Use `mapComponentProps` when a component does not use the conventional
`name`/`value` contract. The mapper owns the complete final props object.

```tsx
import type { ChangeEvent, ComponentType } from "react";

interface CheckboxProps {
  checked: boolean;
  color: "primary" | "neutral";
  name: string;
  onChange(event: ChangeEvent<HTMLInputElement>): void;
}

const Checkbox: ComponentType<CheckboxProps> = ({ color: _, ...props }) => (
  <input {...props} type="checkbox" />
);

const termsField = defineZustikField<{ accepted: boolean }>();

const acceptedField = termsField({
  name: "accepted",
  component: Checkbox,
  // These props are returned by mapComponentProps, not supplied by the caller.
  controlledProps: ["checked", "name", "onChange"] as const,
  componentProps: {
    color: "primary",
  },
  mapComponentProps: ({ componentProps, field, input }) => ({
    ...componentProps,
    checked: field.value,
    name: field.name,
    onChange: (event) => input.onChange(event.currentTarget.checked),
  }),
});
```

`controlledProps` is the type-level declaration of which required component
props the mapper produces. The mapper still has to return them at runtime.

Custom mapping bypasses the default prop injection, event-value extraction,
`valueFromChange`, and automatic user-callback composition. Call the supplied
`input` handlers explicitly, as the checkbox mapper does above.

The mapper receives:

- `componentProps`: caller-supplied, non-controlled props;
- `field`: the current field render state;
- `input`: raw typed Final Form handlers;
- `values`: all current input values.

Keep mappers pure. Use `input` inside the event callbacks returned by the
mapper, not while the mapper itself is calculating props.

If the mapper reads other form values, list their paths in `dependsOn` so its
element is rebuilt only when the field state or those values change. Without
`dependsOn`, any form-value change can rerun the mapper.

`renderKey` overrides the default React key, which is the field name. `key` and
`ref` returned from a mapper are deliberately removed from component props;
`renderKey` is the supported key mechanism and refs are not managed by this
library.

`isEqual` can be supplied on any field to pass a custom field-value comparator
to Final Form.

### Projection errors

A custom mapper executes in the store projection layer, outside React render.
If it throws while a live form updates, Final Form's latest values and metadata
are still published. The last valid element is retained and the failure is
exposed through `field.projectionError`, `form.projectionErrors`, and
`form.hasProjectionErrors`. A later successful projection clears it. A mapper
that throws during initial creation or replacement aborts staging, so an
existing form remains untouched.

## Validation with Valibot

`validationSchema` is optional. When present, it must accept an object input.
Both synchronous and asynchronous Valibot schemas are supported.

Validation issues are converted to Final Form errors as follows:

- the first issue for each field path becomes that field's error;
- nested paths retain their nested error shape;
- the first pathless/root issue becomes Final Form's `FORM_ERROR`;
- an exception or rejection inside schema execution settles as a form-level
  error instead of leaving validation pending;
- successful validation exposes `form.errors` as `undefined`.

Read a field error from the field view and the root validation error from
`form.error`:

```tsx
const emailError = form.fieldsByName.email.error;
const rootError = form.error;
```

`FORM_ERROR` and `ARRAY_ERROR` are re-exported for submission errors or
advanced Final Form use:

```ts
import { FORM_ERROR } from "zustik-form";

const definition = defineZustikForm({
  // ...
  onSubmit: async () => {
    return {
      [FORM_ERROR]: "The server could not save this form",
    };
  },
});
```

### Input and transformed output

The Zustand form state always retains the Valibot **input** shape. Before the
definition's `onSubmit` callback runs, the current input is parsed again and
the callback receives Valibot's **output** shape.

```ts
const QuantitySchema = v.object({
  quantity: v.pipe(
    v.string(),
    v.regex(/^\d+$/, "Enter a whole number"),
    v.transform(Number),
  ),
});

const quantityDefinition = defineZustikForm({
  formPostfix: "Quantity",
  validationSchema: QuantitySchema,
  defaultValues: { quantity: "1" },
  fields: [{ name: "quantity" }] as const,
  onSubmit: (output, context) => {
    output.quantity; // number
    context.inputValues.quantity; // string
  },
});
```

This separation also appears in the exported `InputOf<TDefinition>` and
`OutputOf<TDefinition>` utility types.

Final Form protects the live form from out-of-order asynchronous validation
results. Results from a destroyed or replaced form runtime are not projected
into its replacement.

## Submission

There are two submission entry points:

- `form.onSubmit(event?)` calls `preventDefault()` when an event is supplied and
  is suitable for a React `<form onSubmit>` prop;
- `form.submit()` performs the same submission without an event.

Both resolve to a discriminated result:

```ts
const result = await form.submit();

switch (result.status) {
  case "succeeded":
    break;
  case "invalid":
    console.log(result.errors);
    break;
  case "submission-error":
    console.log(result.errors);
    break;
  case "destroyed":
    // This handle belonged to an old or disposed runtime.
    break;
}
```

The definition's `onSubmit` is not called while validation fails. It may return
field or form submission errors in Final Form's error shape. Thrown or rejected
errors propagate to the caller. Concurrent calls while a submission is pending
reuse that pending submission instead of invoking the callback twice.

The submit context contains:

- `formApi`: the live vanilla Final Form API;
- `formId`: the resolved ID;
- `formPostfix`: the definition postfix;
- `inputValues`: the untransformed input values submitted.

## Reset and initialization

`form.reset()` restarts Final Form with its current initial values and clears
interaction/submission metadata. `form.onReset(event?)` first calls
`preventDefault()` and then performs the same operation.

The optional definition `onReset` callback is an additional action, not the
reset implementation. It runs after the reset has synchronously been published
to Zustand, and it may be asynchronous:

```ts
onReset: async ({ initialValues, previousValues, formApi, formId }) => {
  console.log({ initialValues, previousValues, formApi, formId });
},
```

If this callback throws or rejects, the reset remains committed and the error
is returned to the caller.

`form.initialize(nextValues)` establishes new initial values through Final Form.
The input object is cloned before use. A later reset returns to these latest
initial values. `options.keepDirtyOnReinitialize` controls Final Form's behavior
for dirty fields during initialization.

## Value isolation and `cloneValues`

Definitions, form creation, and `initialize()` isolate values with
`structuredClone` by default. Mutating a source defaults object after definition
or an initialization object after calling `initialize()` does not mutate the
live form.

Use `cloneValues` for classes, functions, platform objects, or other values that
cannot be structured-cloned, or when the application needs custom semantics:

```ts
const definition = defineZustikForm({
  formPostfix: "CustomValues",
  defaultValues: { /* ... */ },
  cloneValues: (values) => customClone(values),
  fields: [/* ... */],
  onSubmit: () => undefined,
});
```

The custom function must return a non-null object. Treat callback context values
and live form snapshots as readonly even when JavaScript cannot enforce it.
Field definitions and `componentProps` are shallow-copied because they may
contain functions, React nodes, and other non-cloneable objects; treat nested
configuration objects as immutable after defining the form.

## Form lifecycle

The form manager is explicit because the library has no component lifecycle.

### Create

```ts
const slot = useOurStore.getState().createForm(commentDefinition);
slot.form.values;
```

Calling `createForm()` twice for the same live postfix throws by default. This
helps catch duplicate initialization and React development behavior early.

### Replace

```ts
useOurStore.getState().createForm(nextCommentDefinition, {
  replace: true,
});
```

Replacement is staged before the old runtime is disposed. If staging fails, the
old form remains live. Once replacement succeeds, old field and form handlers
cannot mutate the new generation. An old `submit()` handle resolves with
`{ status: "destroyed" }` after replacement.

Replacement does not cancel side effects that the application's old `onSubmit`
callback has already started. It prevents their Final Form state from being
projected into the replacement.

### Inspect

```ts
const state = useOurStore.getState();

state.hasForm("Comment"); // boolean
state.getFormApi("Comment"); // vanilla Final Form API | undefined
```

`getFormApi()` is an escape hatch for advanced Final Form operations. Changes
made through the returned API are projected back into the Zustand slot while
the form remains live.

### Destroy one or all

```ts
useOurStore.getState().destroyForm("Comment"); // true when destroyed
useOurStore.getState().destroyForm("Comment"); // false when already absent

useOurStore.getState().disposeForms();
```

Destroying a form unregisters its fields, unsubscribes its projection, releases
its ID, and sets its dynamic Zustand slot to `undefined`. `disposeForms()` does
the same for every form owned by that manager.

Long-lived application forms can be initialized once. Route-, modal-, tab-, or
request-scoped forms should be destroyed by the corresponding application
orchestration. `zustik-form` will not infer that lifecycle from a React render.

## Action postfixes

An optional action postfix allows more than one set of form-manager commands in
a store or avoids naming collisions with existing actions.

```ts
type AdminState = ZustikFormSlice<Forms, "Admin"> & {
  ready: boolean;
};

const createAdminForms = zustikFormCreate<
  Forms,
  "Admin",
  AdminState
>("Admin");
```

This produces:

- `createFormAdmin`;
- `destroyFormAdmin`;
- `disposeFormsAdmin`;
- `getFormApiAdmin`;
- `hasFormAdmin`.

The postfix affects command names only. Dynamic form slots are still named from
the form postfix—for example, `zustikFormComment`, not
`zustikFormCommentAdmin`. Consequently, two managers in the same Zustand store
cannot both own the same form postfix.

The action postfix follows the same ASCII identifier rule as `formPostfix` and
is concatenated exactly. PascalCase is recommended for readable action names.

`createZustikFormSlice` is an alias of `zustikFormCreate` for teams that prefer
the conventional Zustand slice naming style.

## Final Form options

Definitions accept these vanilla Final Form options:

```ts
defineZustikForm({
  // ...
  options: {
    destroyOnUnregister: false,
    keepDirtyOnReinitialize: false,
    validateOnBlur: false,
  },
});
```

| Option | Purpose |
| --- | --- |
| `destroyOnUnregister` | Controls whether Final Form removes a field value when that field unregisters. |
| `keepDirtyOnReinitialize` | Preserves dirty values when `initialize()` changes initial values. |
| `validateOnBlur` | Runs validation on blur rather than on every change. |

For lower-level capabilities, use the typed API returned by `getFormApi()`.
`FormApi`, `FormState`, and `FieldState` types are re-exported from Final Form.

## SSR and hydration

Do not share a mutable singleton store across server requests. Create one store
and its form-slice manager per request, register the required definitions, and
dispose it with the request boundary.

For deterministic hydration:

- create the same forms in the same order on server and client if generated IDs
  are used;
- preferably provide explicit `formId` values for server-rendered forms;
- create forms before rendering the selectors that read their optional slots;
- do not serialize React elements, handlers, Final Form APIs, or complete form
  slots into the HTML payload;
- initialize a new client runtime from application data rather than reviving a
  serialized runtime.

The library does not use `useEffect`, mount detection, or hydration-specific
branches. SSR ownership remains an application responsibility.

## Zustand persistence and devtools

Form slots intentionally contain functions, component references, and React
elements. They are view-model snapshots, not a persistence format. Final Form
runtimes themselves are held in the slice closure and cannot be reconstructed
from JSON.

When using Zustand `persist`, whitelist durable application state instead of
persisting the full store:

```ts
persist(appStateCreator, {
  name: "app",
  partialize: (state) => ({
    preferences: state.preferences,
    draftId: state.draftId,
  }),
});
```

Recreate forms from definitions and explicitly initialize any values that the
application chooses to persist. The same caution applies to remote devtools,
logging, server snapshots, and any middleware that assumes serializable state.

## Grocery sandbox without an app bundler

The repository includes a grocery-form sandbox under `examples/grocery/`. It
is served without Vite, Webpack, Parcel, or another application bundler.

From the repository root:

```sh
pnpm install
pnpm run dev
```

Open the local URL printed by the command. The root `dev` script serves the
grocery sandbox; there is no need to run a second command inside the example
directory. The default URL is `http://127.0.0.1:4173`. Stop the server with
`Ctrl+C`.

The sandbox is intended to make the two consumption styles easy to compare:
the `groceryFields` tab binds headless field view-models manually, while the
`groceryComponents` tab renders `form.components` directly. Both are initialized
by separate tab slices inside one global store and add to the same grocery list.
A small Node static server, browser import map, and local ESM shims make the
interaction between the store, form definitions, and browser visible without
framework build-tool machinery.

## API summary

### Runtime exports

| Export | Purpose |
| --- | --- |
| `zustikFormCreate(postfix?)` | Creates the Zustand form-manager slice. |
| `createZustikFormSlice(postfix?)` | Alias of `zustikFormCreate`. |
| `defineZustikForm(definition)` | Validates, clones, and preserves the types of a form definition. |
| `defineZustikField<TValues>()` | Creates a typed identity builder for headless or component field definitions. |
| `valueFromEvent(event)` | Returns `event.currentTarget.value`. |
| `checkedFromEvent(event)` | Returns `event.currentTarget.checked`. |
| `ARRAY_ERROR` | Final Form's array-level error key. |
| `FORM_ERROR` | Final Form's form-level error key. |

### Default manager actions

| Action | Result |
| --- | --- |
| `createForm(definition, options?)` | Creates and returns a form slot; `{ replace: true }` explicitly replaces an existing postfix. |
| `destroyForm(formPostfix)` | Destroys one live form and returns whether it existed. |
| `disposeForms()` | Destroys every form owned by this manager. |
| `getFormApi(formPostfix)` | Returns the live vanilla Final Form API or `undefined`. |
| `hasForm(formPostfix)` | Reports whether the manager owns a live form. |

All five names receive the optional action postfix when one is supplied.

### Form definition

| Property | Meaning |
| --- | --- |
| `formPostfix` | Required dynamic identity and slot-name suffix. |
| `defaultValues` | Required object containing the input value shape. |
| `fields` | Required ordered headless/component field definitions. |
| `onSubmit` | Required callback receiving schema output when validation is configured, or input values otherwise, plus submit context. |
| `validationSchema` | Optional synchronous or asynchronous Valibot object-input schema. |
| `onReset` | Optional additional action run after reset is published. |
| `formId` | Optional explicit HTML-safe ID; otherwise generated per manager. |
| `cloneValues` | Optional custom replacement for default `structuredClone`. |
| `options` | Optional Final Form behavior settings. |

### Form view-model

The form view includes:

- identity: `formId`, `formPostfix`;
- values: `values`, `initialValues`;
- validation: `valid`, `invalid`, `validating`, `errors`, `error`,
  `hasValidationErrors`;
- submission: `submitting`, `submitSucceeded`, `submitFailed`, `submitErrors`,
  `submitError`, `hasSubmitErrors`, `dirtySinceLastSubmit`,
  `dirtyFieldsSinceLastSubmit`, `modifiedSinceLastSubmit`;
- interaction: `active`, `dirty`, `dirtyFields`, `modified`, `touched`,
  `visited`, `pristine`;
- projections: `fields`, `fieldsByName`, `components`, `projectionErrors`,
  `hasProjectionErrors`;
- commands: `change`, `blur`, `focus`, `initialize`, `submit`, `onSubmit`,
  `reset`, `onReset`.

Important exported types include `ZustikFormSlice`, `ZustikFormDefinition`,
`ZustikFormView`, `ZustikFieldView`, `ZustikComponentProps`,
`ZustikComponentBindingContext`, `ZustikSubmitResult`, `InputOf`, `OutputOf`,
`FieldPath`, and `FieldPathValue`.

## Development

The project uses pnpm and Node's built-in test runner.

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run check
```

`pnpm test` performs a clean ESM build, checks a consumer through the published
package export, and runs the runtime suite. `pnpm run check` runs both the
compile-time public API checks and that complete test pipeline.

## License

[MIT](./LICENSE) © 2026 Zustik Form contributors.
