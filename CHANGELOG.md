# Changelog

## 0.3.0 — Store-aware definitions and stable components

### Why this release exists

Static form slices made ownership explicit in `0.2.0`, but lifecycle callbacks
still needed an application-owned store variable when they wanted to call an
action from another slice. Generated component elements also changed identity
with their field values, so a parent selecting `form.components` could rerender
on every keystroke. That was particularly disruptive for table and grid
components whose children may lose focus when their parent rebuilds.

`0.3.0` connects each form to the Zustand store that contains it and moves
generated field updates behind stable, field-local React bridges.

### Added

- A typed, curried store-aware form builder:

  ```ts
  type AlertsStoreAccess = Pick<AppStore, "saveAlert" | "lastSavedAt">;

  const createAlertFormSlice =
    createZustikFormSlice<AlertsStoreAccess>()({
      // formId, formPostfix, schema, defaults, and fields
      onSubmit: async (values, { get, set, store }) => {
        await get().saveAlert(values);
        set({ lastSavedAt: Date.now() });
        store.getState();
      },
    });
  ```

- `set`, `get`, and the vanilla `store` API on both `onSubmit` and `onReset`
  contexts.
- `ZustikFormSliceBuilder`, `ZustikStoreContext`, `ZustikStoreSet`,
  `ZustikStoreGet`, and `ZustikStoreApi` public types.
- Per-store lifecycle binding: one factory reused in multiple stores always
  receives the accessors for the store currently creating it.

### Rendering changes

- `form.components` now has stable identity for the lifetime of a store.
- Every named generated element also keeps stable identity while its internal
  field bridge subscribes only to its resolved props.
- Generated controls receive fresh values, handlers, mapped props, and
  validation state without requiring the parent that rendered the element to
  rerender.
- `form.formProps` is now stable as well, so a parent may select both
  `components` and `formProps` with shallow equality.
- Mapper dependency behavior is preserved: use `dependsOn` to list other form
  values consumed by `mapProps`; use `dependsOn: []` when it reads only its own
  field state.

Generated React elements should be treated as opaque renderable values. Read
or invoke current control props through `form.fieldProps`, not
`form.components.someField.props`.

### Compatibility

- The direct `createZustikFormSlice(configuration)` API remains supported.
- Form state, validation, submission, reset, and headless `fieldProps` behavior
  remain compatible with `0.2.0`.
- Applications only need the curried form when lifecycle callbacks require
  typed access to another part of the containing Zustand store.

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
