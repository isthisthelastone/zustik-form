# Changelog

## 0.2.0 — Static form slices

### Why this release exists

The `0.1.x` API centered on one dynamic manager slice. Applications registered
definitions at runtime and coordinated form creation, replacement, reset,
destruction, and optional slots through feature actions.

That flexibility made ordinary forms harder to own and reason about. In real
usage, form creation became mixed into unrelated actions, consumers had to
remember whether a form had been initialized, and a registry type plus the
entire application state had to be threaded through the factory's generics.

`0.2.0` makes the common case the primary design: one configuration creates one
static, reusable Zustand slice factory. The form exists when the store exists,
its owner is visible where the factory is spread, and all state and actions
remain in Zustand as one source of truth.

### Breaking changes

- Replaced the dynamic manager with `createZustikFormSlice(configuration)`.
- A factory now configures exactly one form and creates one independent runtime
  for each store in which it is used.
- Removed `zustikFormCreate`, `defineZustikForm`, and `defineZustikField`.
- Removed form registries and the full-application-state factory generic.
- Removed runtime `createForm`, `destroyForm`, `disposeForms`, `hasForm`, and
  `getFormApi` manager actions.
- Form state is now always present directly at `zustikForm${formPostfix}`;
  optional `{ form }` slots are gone.
- `fields` is now a configuration object keyed by field path rather than an
  array with repeated `name` properties.
- `form.fields` is now keyed by field path; `fieldsByName` was removed.
- `form.components` is now keyed by component-backed field path rather than an
  ordered array.
- Added `form.fieldProps`, keyed by every configured field path.
- Added `form.formProps`, ready to spread onto a native `<form>`.
- Renamed field configuration `componentProps` to `props` and
  `mapComponentProps` to `mapProps`; `controlledProps` is no longer needed.
- The raw Final Form escape hatch is now available directly as `form.api`.
- Public submission no longer returns a `destroyed` status because static forms
  do not have a runtime destruction lifecycle.

### Added

- `createZustikFormSlice()` with configuration, schema, field, component, and
  callback inference.
- `ZustikFormSlice<typeof factory>` and `ReturnType<typeof factory>` support for
  composing store types without passing the store type into the factory.
- Direct named rendering:

  ```tsx
  const { username, password } = form.components;
  return <form {...form.formProps}>{username}{password}</form>;
  ```

- Direct headless rendering:

  ```tsx
  const { username, password } = form.fieldProps;
  return <form {...form.formProps}><input {...username} /><input {...password} /></form>;
  ```

- `form.setValue()` as the explicit field setter; `change()` remains as a Final
  Form-compatible alias.
- Duplicate postfix and form-ID protection when multiple static factories are
  composed into one store.
- Per-store cloning and isolation when one factory creates multiple stores.

### Preserved

- Vanilla Final Form as the form engine.
- Synchronous and asynchronous Valibot validation and transformed submit
  output.
- Structured-clone value isolation.
- Default event value extraction and the `valueFromEvent` and
  `checkedFromEvent` helpers.
- Custom component mapping, dependency-aware projection, projection-error
  recovery, concurrent submit deduplication, submission errors, and async reset
  callbacks.

### Migration summary

```ts
// 0.1.x
const createFormsSlice = zustikFormCreate<Forms, AppState>();
get().createForm(commentDefinition);
state.zustikFormComment?.form.fieldsByName.comment;

// 0.2.0
const createCommentFormSlice = createZustikFormSlice(commentConfiguration);
const store = create((set, get, api) => ({
  ...createCommentFormSlice(set, get, api),
}));
state.zustikFormComment.fields.comment;
```

The README contains a complete migration table and examples for both rendering
modes.

## 0.1.2

- Required form values to be structured-cloneable.
- Added repository metadata and discovery keywords.

## 0.1.0

- First public release of the dynamic form-manager API.
