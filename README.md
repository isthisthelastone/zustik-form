# zustik-form

Static, typed form slices for Zustand, powered by vanilla Final Form, Valibot,
and React.

`zustik-form` keeps form values, validation state, field bindings, submission,
and reset behavior inside the same Zustand store as the rest of an application.
Each call to `createZustikFormSlice()` configures exactly one form and returns an
ordinary Zustand slice factory. Spread that factory wherever the form belongs.

```text
form configuration
        ↓
createZustikFormSlice(...)
        ↓
static Zustand slice factory
        ↓
zustikForm<UserValidation>
        ↓
values · fields · fieldProps · components · actions
```

Version `0.3.0` adds typed access to the containing Zustand store and stable,
field-local generated components. The static ownership model introduced in
`0.2.0` remains unchanged. See [Accessing the containing store](#accessing-the-containing-store),
[Stable generated components](#stable-generated-components), and
[Why static slices?](#why-static-slices).

## What it provides

- One statically configured form per slice factory.
- One source of truth in Zustand; no second React form state.
- Typed field paths, input values, and Valibot-transformed submit output.
- A form that exists immediately when its Zustand store is created.
- Typed `set`, `get`, and vanilla store access in submit and reset callbacks.
- Named `fieldProps` that can be spread onto your own controls.
- Named, fully bound React elements with stable parent-facing identity.
- Ready-to-spread native `formProps` for submit, reset, and ID wiring.
- Synchronous and asynchronous Valibot validation.
- Final Form metadata and an escape hatch to its vanilla API.
- No context provider, wrapper form component, or application-level mount
  lifecycle.

## Requirements

- React **18.3.1**.
- Zustand `>=5.0.0 <6.0.0`.
- Node.js 18 or newer for Node-based builds and tests.
- ESM (`import`); CommonJS `require()` is not supported.
- TypeScript 5.0 or newer for the published declarations.
- A runtime with `structuredClone`. Form values must be structured-cloneable.

## Installation

```sh
pnpm add zustik-form react@18.3.1 zustand@^5 valibot
```

Final Form is an internal dependency. Application code normally imports
Valibot directly to define schemas.

## Quick start

### Configure one static form factory

Field paths are the keys of `fields`; they are not repeated inside every field
definition. The schema supplies the input and transformed output types, while
the rest of the configuration is inferred from the object passed to the
factory.

```tsx
import type { ChangeEvent, ComponentType } from "react";
import * as v from "valibot";

import {
  createZustikFormSlice,
  valueFromEvent,
} from "zustik-form";

const UserValidationSchema = v.object({
  username: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(3, "Use at least three characters"),
  ),
  password: v.pipe(
    v.string(),
    v.minLength(8, "Use at least eight characters"),
  ),
});

interface TextFieldProps {
  label: string;
  name: string;
  onBlur(): void;
  onChange(event: ChangeEvent<HTMLInputElement>): void;
  onFocus(): void;
  type?: "text" | "password";
  value: string;
}

const TextField: ComponentType<TextFieldProps> = ({ label, ...inputProps }) => (
  <label>
    {label}
    <input {...inputProps} />
  </label>
);

export const createUserValidationFormSlice = createZustikFormSlice({
  formId: "user-validation-form",
  formPostfix: "UserValidation",
  validationSchema: UserValidationSchema,
  defaultValues: {
    username: "",
    password: "",
  },
  fields: {
    username: {
      component: TextField,
      props: { label: "Username" },
      valueFromChange: valueFromEvent,
    },
    password: {
      component: TextField,
      props: { label: "Password", type: "password" },
      valueFromChange: valueFromEvent,
    },
  },
  onSubmit: async (values, context) => {
    // `values` is the Valibot output.
    // `context.inputValues` is the untransformed input held in Zustand.
    await saveUser(values);
  },
  onReset: ({ previousValues }) => {
    console.log("Reset values", previousValues);
  },
});
```

The factory call validates and snapshots the configuration. Calling the
returned slice factory creates a fresh Final Form runtime and a fresh copy of
the defaults for that particular Zustand store.

### Spread the factory into a store

The factory does not receive a form registry or the application's entire state
as generic arguments.

```ts
import { create } from "zustand";
import type { ZustikFormSlice } from "zustik-form";

import { createUserValidationFormSlice } from "./user-validation-form.js";

type UserValidationFormSlice = ZustikFormSlice<
  typeof createUserValidationFormSlice
>;

type AppState = UserValidationFormSlice & {
  count: number;
  increment(): void;
};

export const useAppStore = create<AppState>()((set, get, store) => ({
  ...createUserValidationFormSlice(set, get, store),
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));
```

`ReturnType<typeof createUserValidationFormSlice>` is equivalent to
`ZustikFormSlice<typeof createUserValidationFormSlice>` if you prefer the
built-in TypeScript utility.

The form is immediately available at:

```ts
useAppStore.getState().zustikFormUserValidation;
```

It is not optional, and no bootstrap or `createForm()` action is required.

## Accessing the containing store

When submit or reset logic needs another Zustand slice, create the form through
the curried store-aware builder. Describe only the state and actions the form
actually needs; this is an access contract, not a generic for the entire app.

```ts
type AlertValues = v.InferOutput<typeof AlertSchema>;

interface AlertsStoreAccess {
  lastSavedId: string | undefined;
  saveAlert(values: AlertValues): Promise<{ id: string }>;
}

export const createAlertFormSlice =
  createZustikFormSlice<AlertsStoreAccess>()({
    formPostfix: "Alert",
    validationSchema: AlertSchema,
    defaultValues: { title: "", message: "" },
    fields: { title: {}, message: {} },
    onSubmit: async (values, { get, set, store }) => {
      const saved = await get().saveAlert(values);
      set({ lastSavedId: saved.id });

      // The full vanilla API is available when needed.
      store.getState();
    },
    onReset: ({ get }) => {
      console.log("Reset inside", get());
    },
  });
```

Compose it normally:

```ts
type AppState =
  AlertsStoreAccess & ZustikFormSlice<typeof createAlertFormSlice>;

const useAppStore = create<AppState>()((set, get, store) => ({
  lastSavedId: undefined,
  saveAlert: api.saveAlert,
  ...createAlertFormSlice(set, get, store),
}));
```

The lifecycle context receives the exact `set`, `get`, and `store` belonging to
the store that invoked the slice factory. Reusing one form factory in multiple
stores does not capture or share either store. The direct
`createZustikFormSlice(configuration)` form remains available when lifecycle
callbacks do not need typed access to host state.

## Rendering mode 1: configured components

When a field supplies `component`, `zustik-form` combines its static `props`
with the live `name`, `value`, `onChange`, `onBlur`, and `onFocus` bindings. It
returns the resulting keyed React element under the field's name.

```tsx
import { useShallow } from "zustand/react/shallow";

import { useAppStore } from "./store.js";

function SubmitButton() {
  const submitting = useAppStore(
    (state) => state.zustikFormUserValidation.submitting,
  );
  return <button type="submit" disabled={submitting}>Submit</button>;
}

export function UserValidationForm() {
  const { components, formProps } = useAppStore(
    useShallow((state) => ({
      components: state.zustikFormUserValidation.components,
      formProps: state.zustikFormUserValidation.formProps,
    })),
  );
  const { username, password } = components;

  return (
    <form {...formProps} noValidate>
      <div>{username}</div>
      <div>{password}</div>

      <SubmitButton />
      <button type="reset">Reset</button>
    </form>
  );
}
```

No render-time props are required. The configured fields already know their
components, additional props, current values, handlers, validation state, and
React keys.

`components` is a keyed object rather than an array. Your JSX determines the
layout and ordering explicitly.

### Stable generated components

`form.components`, each named element inside it, and `form.formProps` keep the
same references for the lifetime of that store. Every element renders a small
field bridge that subscribes to its own resolved props with
`useSyncExternalStore`.

Consequently, the parent above does not rerender on a keystroke even though the
active input receives its new value and validation state. Dynamic status UI can
subscribe in a small child such as `SubmitButton` without rebuilding a table,
grid, or other parent that composes the generated fields.

Generated elements are opaque renderable values. Do not read or call
`form.components.username.props`; use `form.fieldProps.username` when current
props or handlers are needed outside React rendering.

## Rendering mode 2: named field props

A field may omit `component`. It then cannot accept component `props`, but the
form still exposes a named, ready-to-spread binding through `fieldProps`.

```ts
export const createLoginFormSlice = createZustikFormSlice({
  formPostfix: "Login",
  defaultValues: {
    email: "",
    password: "",
  },
  fields: {
    email: {},
    password: {},
  },
  onSubmit: submitLogin,
});
```

```tsx
export function LoginForm() {
  const form = useAppStore((state) => state.zustikFormLogin);
  const { email, password } = form.fieldProps;

  return (
    <form {...form.formProps}>
      <input {...email} type="email" />
      <input {...password} type="password" />
      <button type="submit">Log in</button>
    </form>
  );
}
```

`fieldProps` is available for every field, including component-backed fields.
This makes it possible to switch rendering approaches without changing form
state or validation.

The default `onChange` accepts a raw value or an event-like first argument. It
reads `currentTarget` before `target`, uses `checked` for checkboxes, and uses
`value` otherwise. Use `valueFromEvent`, `checkedFromEvent`, or a custom
`valueFromChange` when explicit conversion is preferable.

## Reading field state

`fields` is keyed by the same field paths as the configuration:

```ts
const form = useAppStore.getState().zustikFormUserValidation;

form.fields.username.value;
form.fields.username.touched;
form.fields.username.error;
form.fields.username.onChange("Ada");
```

Nested paths remain literal keys:

```ts
const createProfileFormSlice = createZustikFormSlice({
  formPostfix: "Profile",
  defaultValues: {
    profile: { displayName: "" },
  },
  fields: {
    "profile.displayName": {},
  },
  onSubmit: saveProfile,
});

form.fields["profile.displayName"];
form.fieldProps["profile.displayName"];
```

Field paths support objects and numeric array segments, with type inference
capped at five nested levels for compiler performance. Every configured path is
validated against `defaultValues` when the factory is created.

## Form actions

Actions live on the static form value:

```ts
const form = useAppStore.getState().zustikFormUserValidation;

form.setValue("username", "Ada");
form.change("username", "Ada"); // Final Form-compatible alias
form.focus("username");
form.blur("username");
form.initialize({ username: "Grace", password: "secret123" });
await form.reset();
const result = await form.submit();
```

- `setValue()` and `change()` update one typed field path.
- `initialize()` replaces the form's initial values with a cloned input object.
- `reset()` restarts Final Form and then runs the configured `onReset` callback.
- `submit()` validates, parses through Valibot, and invokes the configured
  `onSubmit` callback.
- Concurrent public `submit()` calls share one pending promise.
- Store-aware `onSubmit` and `onReset` contexts include the containing store's
  typed `set`, `get`, and `store` API.

`form.formProps` contains `{ id, onSubmit, onReset }` for a native `<form>`.
Its reference is stable. The event handlers call `preventDefault()` and
delegate to the same actions.

Submission resolves to one of:

```ts
{ status: "succeeded" }
{ status: "invalid", errors }
{ status: "submission-error", errors }
```

Exceptions thrown by `onSubmit` reject normally.

## Validation with Valibot

`validationSchema` is optional. Synchronous and asynchronous Valibot schemas
are supported.

- The Zustand form values retain the schema's input shape.
- `onSubmit` receives the schema's output shape.
- The first issue for a field path becomes that field's validation error.
- A pathless issue becomes Final Form's `FORM_ERROR`.
- Rejected schema execution settles as a form-level error.
- Final Form prevents older async validation results from replacing newer ones.

```ts
const emailError = form.fields.email.error;
const rootError = form.error;
```

`FORM_ERROR` and `ARRAY_ERROR` are re-exported for form-level and array-level
submission errors.

An `onSubmit` callback may return field or form errors:

```ts
import { FORM_ERROR } from "zustik-form";

onSubmit: async (values) => {
  const result = await save(values);
  if (!result.ok) {
    return {
      email: result.emailError,
      [FORM_ERROR]: result.message,
    };
  }
},
```

## Custom component bindings

The default binding works with conventional `name`, `value`, `onChange`,
`onBlur`, and `onFocus` props. Use `mapProps` for controls such as checkboxes or
design-system components with a different contract.

```tsx
interface CheckboxProps {
  checked: boolean;
  label: string;
  name: string;
  onChange(event: React.ChangeEvent<HTMLInputElement>): void;
}

const Checkbox: React.ComponentType<CheckboxProps> = (props) => (
  <label>
    {props.label}
    <input
      checked={props.checked}
      name={props.name}
      onChange={props.onChange}
      type="checkbox"
    />
  </label>
);

fields: {
  accepted: {
    component: Checkbox,
    dependsOn: [],
    props: { label: "Accept the terms" },
    mapProps: ({ field, input, props }) => ({
      checked: field.value,
      label: props.label ?? "Accept",
      name: field.name,
      onChange: (event) => input.onChange(event.currentTarget.checked),
    }),
  },
},
```

`mapProps` owns the complete final component props object. It receives:

- `props`: static props from the field configuration;
- `field`: current field state;
- `input`: raw typed change, focus, and blur actions;
- `values`: all current input values.

If a mapper reads another field, list that path in `dependsOn`. Use
`dependsOn: []` when it reads only its own `field`; then unrelated values do not
update that generated component. Without `dependsOn`, a mapper can rerun for
every value change because it is allowed to inspect the complete `values`
object.

```ts
dependsOn: ["country"],
mapProps: ({ field, input, props, values }) => ({
  ...props,
  disabled: values.country === "",
  name: field.name,
  onChange: (value) => input.onChange(value),
  value: field.value,
}),
```

A mapper failure during an update does not discard the latest form state. The
last valid element is retained and the error is exposed through:

```ts
form.fields.email.projectionError;
form.projectionErrors.email;
form.hasProjectionErrors;
```

The next successful projection clears it.

## Multiple forms

Create and name one factory per form, then spread each factory into the store or
feature slice that owns it:

```ts
const createUserFormSlice = createZustikFormSlice({
  formPostfix: "User",
  // ...
});

const createProductFormSlice = createZustikFormSlice({
  formPostfix: "Product",
  // ...
});

const useStore = create((set, get, store) => ({
  ...createUserFormSlice(set, get, store),
  ...createProductFormSlice(set, get, store),
  ...createOtherFeatureSlice(set, get, store),
}));
```

The result contains:

```ts
state.zustikFormUser;
state.zustikFormProduct;
```

Postfixes and form IDs must be unique inside one store. Duplicate static form
slices are rejected during store creation.

One factory can be used to create multiple stores. Every store receives an
independent form runtime and independent cloned defaults, which is suitable for
SSR when a fresh Zustand store is created per request.

## Why static slices?

`0.1.x` optimized for creating an arbitrary registry of forms at runtime. That
made runtime creation possible, but it also pushed lifecycle decisions into
unrelated feature actions:

```text
create manager
→ create store
→ decide where to initialize each form
→ guard against duplicates
→ create, replace, destroy, and dispose forms
→ handle optional form slots while rendering
```

In real application code, that indirection made it harder to answer basic
questions: where a form is created, whether it exists, which action resets it,
and which feature owns its lifecycle. It also required a registry type plus the
entire application state as generic parameters.

`0.2.0` chooses the normal Zustand composition model:

```text
configure one form
→ receive one slice factory
→ spread it where the form belongs
→ use the always-present form state and actions
```

Most applications do not need an unbounded number of runtime-defined forms.
Static factories make the common case declarative, local, and predictable. An
application that genuinely needs dynamic form factories can still create and
compose its own stores around `zustik-form`, but that is no longer the public
pattern the library encourages.

## Migrating from 0.1.x

`0.2.0` is intentionally breaking because the core ownership model changed.

### Before

```ts
interface Forms {
  Comment: typeof commentDefinition;
}

type AppState = ZustikFormSlice<Forms> & OtherState;
const createFormsSlice = zustikFormCreate<Forms, AppState>();

const useStore = create<AppState>()((set, get, store) => ({
  ...createFormsSlice(set, get, store),
  initializeComment: () => get().createForm(commentDefinition),
}));

useStore.getState().initializeComment();

const form = useStore((state) => state.zustikFormComment?.form);
```

### After

```ts
const createCommentFormSlice = createZustikFormSlice({
  formPostfix: "Comment",
  defaultValues: { comment: "" },
  fields: { comment: {} },
  onSubmit: saveComment,
});

type AppState =
  ZustikFormSlice<typeof createCommentFormSlice> & OtherState;

const useStore = create<AppState>()((set, get, store) => ({
  ...createCommentFormSlice(set, get, store),
  // other state
}));

const form = useStore((state) => state.zustikFormComment);
```

### Removed in 0.2.0

- `zustikFormCreate()` and the dynamic manager.
- `defineZustikForm()` and `defineZustikField()` identity layers.
- Form registries and whole-application-state factory generics.
- Runtime `createForm`, `destroyForm`, `disposeForms`, `hasForm`, and
  `getFormApi` manager actions.
- Optional `{ form }` slots.
- Ordered `components` arrays and `fieldsByName`.
- `componentProps`, `controlledProps`, and `mapComponentProps` configuration
  names.

### Replacements

| 0.1.x | 0.2.0 |
| --- | --- |
| `zustikFormCreate<Forms, AppState>()` | `createZustikFormSlice(configuration)` |
| `interface Forms` registry | One named factory per form |
| `state.createForm(definition)` | Spread the static factory during store creation |
| `state.zustikFormComment?.form` | `state.zustikFormComment` |
| `form.fieldsByName.comment` | `form.fields.comment` |
| `form.components` array | `form.components.comment` keyed element |
| `field.props` for manual rendering | `form.fieldProps.comment` |
| `{ id, onSubmit, onReset }` assembled by the app | `form.formProps` |
| `componentProps` | `props` |
| `mapComponentProps` | `mapProps` |
| `getFormApi(postfix)` | `form.api` |

## Form view reference

The state at `zustikForm${formPostfix}` includes:

- Identity: `formId`, `formPostfix`, `formProps`.
- Values: `values`, `initialValues`.
- Named projections: `fields`, `fieldProps`, `components`.
- Validation and submission: `errors`, `error`, `submitErrors`, `submitError`,
  `valid`, `invalid`, `validating`, `submitting`, `submitFailed`,
  `submitSucceeded`.
- Edit metadata: `active`, `dirty`, `pristine`, `dirtyFields`, `touched`,
  `visited`, `modified`, and their submit-related variants.
- Actions: `setValue`, `change`, `focus`, `blur`, `initialize`, `reset`,
  `submit`, `onReset`, `onSubmit`.
- Advanced access: `api`, `projectionErrors`, `hasProjectionErrors`.

`components` and `formProps` are stable parent-facing projections.
`fields`, `fieldProps`, values, and metadata continue to publish fresh
references when their selected state changes.

## Value isolation

The factory snapshots `defaultValues` with `structuredClone`, and each store
invocation clones them again. `initialize()` also clones its input. Mutating a
source object later cannot mutate a live form or another store instance.

Values may contain nested objects and arrays but must remain
structured-cloneable data. Functions, weak collections, DOM nodes, React
elements, and objects that rely on custom class prototypes are not supported as
form values.

Field definitions and static `props` are shallow-copied because configuration
may legitimately contain functions and React nodes. Treat nested configuration
objects as immutable after creating the factory.

## Grocery example

The repository includes a no-bundler React 18 grocery sandbox. It composes two
static form factories into one vanilla Zustand store:

- one form renders named `fieldProps` through application-owned controls;
- one form destructures named, fully bound elements from `components`.

Both submit into the same grocery-list slice.
The generated-components tab also exposes render counters on
`globalThis.zustikRenderMetrics` so parent stability can be inspected while
typing.

```sh
pnpm install
pnpm dev
```

Open `http://127.0.0.1:4173`.

## Development

```sh
pnpm install
pnpm check
pnpm pack
```

`pnpm check` runs strict TypeScript checks, builds the package, verifies the
published-package consumer fixture, runs runtime and async tests, and validates
the browser example.

## License

MIT
