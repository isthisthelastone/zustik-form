import * as v from "valibot";
import { createStore } from "zustand/vanilla";
import { createZustikFormSlice } from "zustik-form";

const React = globalThis.React;
const ReactDOM = globalThis.ReactDOM;
const h = React.createElement;

if (React.version !== "18.3.1" || ReactDOM.version !== "18.3.1") {
  throw new Error(
    `Expected React and ReactDOM 18.3.1; received React ${React.version} and ReactDOM ${ReactDOM.version}.`,
  );
}

const grocerySchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty("Give the grocery item a name."),
    v.maxLength(64, "Keep the item name under 64 characters."),
  ),
  price: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty("Enter a price."),
    v.transform(Number),
    v.number("Price must be a number."),
    v.minValue(0.01, "Price must be at least $0.01."),
    v.maxValue(10_000, "Price must be below $10,000."),
  ),
  quantity: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty("Enter a quantity."),
    v.transform(Number),
    v.number("Quantity must be a number."),
    v.integer("Quantity must be a whole number."),
    v.minValue(1, "Add at least one item."),
    v.maxValue(999, "Quantity cannot exceed 999."),
  ),
  storeName: v.pipe(
    v.string(),
    v.trim(),
    v.nonEmpty("Choose a store."),
    v.maxLength(64, "Keep the store name under 64 characters."),
  ),
});

const defaultValues = Object.freeze({
  name: "",
  price: "",
  quantity: "1",
  storeName: "",
});

const fieldSpecifications = Object.freeze({
  name: Object.freeze({
    autoComplete: "off",
    caption: "Milk, tomatoes, coffee…",
    label: "Item name",
    placeholder: "Organic oat milk",
    type: "text",
  }),
  price: Object.freeze({
    autoComplete: "off",
    caption: "Price for one item",
    inputMode: "decimal",
    label: "Unit price",
    min: "0.01",
    placeholder: "4.50",
    step: "0.01",
    type: "number",
  }),
  quantity: Object.freeze({
    autoComplete: "off",
    caption: "Whole items only",
    inputMode: "numeric",
    label: "Quantity",
    min: "1",
    placeholder: "1",
    step: "1",
    type: "number",
  }),
  storeName: Object.freeze({
    autoComplete: "organization",
    caption: "Where you plan to shop",
    label: "Store",
    placeholder: "Neighborhood Market",
    type: "text",
  }),
});

function normalizeIssue(issue) {
  if (typeof issue === "string") return issue;
  if (issue === undefined || issue === null) return "";
  if (Array.isArray(issue)) return issue.map(normalizeIssue).filter(Boolean).join(", ");
  if (typeof issue === "object" && "message" in issue) {
    return String(issue.message);
  }
  return String(issue);
}

function visibleIssue(field) {
  return field.touched || field.submitFailed
    ? normalizeIssue(field.error ?? field.submitError)
    : "";
}

function GroceryComponentField({
  caption,
  errorMessage = "",
  invalid = false,
  label,
  name,
  ...inputProps
}) {
  const inputId = `component-${name}`;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;

  return h(
    "div",
    { className: `field-shell${invalid ? " field-shell--invalid" : ""}` },
    h(
      "div",
      { className: "field-label-row" },
      h("label", { className: "field-label", htmlFor: inputId }, label),
      h("span", { className: "field-mode" }, "component"),
    ),
    h("input", {
      ...inputProps,
      "aria-describedby": errorMessage ? errorId : helpId,
      "aria-invalid": invalid,
      className: "field-control",
      id: inputId,
      name,
    }),
    errorMessage
      ? h(
          "p",
          { className: "field-message field-message--error", id: errorId },
          errorMessage,
        )
      : h("p", { className: "field-message", id: helpId }, caption),
  );
}

function mapComponentProps({ field, input, props }) {
  const errorMessage = visibleIssue(field);
  return {
    ...props,
    errorMessage,
    invalid: errorMessage.length > 0,
    name: field.name,
    onBlur: input.onBlur,
    onChange: (event) => input.onChange(event.currentTarget.value),
    onFocus: input.onFocus,
    value: field.value,
  };
}

function componentField(name) {
  return {
    component: GroceryComponentField,
    mapProps: mapComponentProps,
    props: fieldSpecifications[name],
  };
}

function createSharedGrocerySlice(set) {
  return {
    activeTab: "fields",
    groceries: [],
    notice: "Both forms are live and share this one grocery list.",
    addGrocery: (values, source, formId) => {
      const item = Object.freeze({
        ...values,
        formId,
        id: globalThis.crypto.randomUUID(),
        source,
      });
      set((state) => ({
        groceries: [item, ...state.groceries],
        notice: `${values.quantity} × ${values.name} added from ${source}.`,
      }));
    },
    announce: (notice) => set({ notice }),
    clearGroceries: () =>
      set({ groceries: [], notice: "The shared grocery list is clear." }),
    removeGrocery: (id) =>
      set((state) => ({
        groceries: state.groceries.filter((item) => item.id !== id),
        notice: "Item removed from the shared list.",
      })),
    setActiveTab: (activeTab) => set({ activeTab }),
  };
}

let groceryStore;

// Each call describes one form once and returns an ordinary static Zustand
// slice factory. There is no registry, bootstrap action, or runtime creation.
const createGroceryFieldsFormSlice = createZustikFormSlice({
  defaultValues,
  fields: {
    name: {},
    price: {},
    quantity: {},
    storeName: {},
  },
  formId: "grocery-fields-form",
  formPostfix: "groceryFields",
  onReset: ({ formId }) => {
    groceryStore.getState().announce(`Reset ${formId} to its default values.`);
  },
  onSubmit: (values, { formId }) => {
    groceryStore.getState().addGrocery(values, "field props", formId);
  },
  validationSchema: grocerySchema,
});

const createGroceryComponentsFormSlice = createZustikFormSlice({
  defaultValues,
  fields: {
    name: componentField("name"),
    price: componentField("price"),
    quantity: componentField("quantity"),
    storeName: componentField("storeName"),
  },
  formId: "grocery-components-form",
  formPostfix: "groceryComponents",
  onReset: ({ formId }) => {
    groceryStore.getState().announce(`Reset ${formId} to its default values.`);
  },
  onSubmit: (values, { formId }) => {
    groceryStore.getState().addGrocery(values, "generated components", formId);
  },
  validationSchema: grocerySchema,
});

// Both forms exist as soon as this one vanilla Zustand store exists.
groceryStore = createStore()((set, get, store) => ({
  ...createSharedGrocerySlice(set, get, store),
  ...createGroceryFieldsFormSlice(set, get, store),
  ...createGroceryComponentsFormSlice(set, get, store),
}));
globalThis.groceryStore = groceryStore;

function useGroceryStore() {
  return React.useSyncExternalStore(
    groceryStore.subscribe,
    groceryStore.getState,
    groceryStore.getInitialState,
  );
}

function StatusPills({ form, mode }) {
  return h(
    "div",
    { className: "status-pills", "aria-label": "Form status" },
    h("span", { className: "status-pill status-pill--accent" }, mode),
    h(
      "span",
      { className: `status-pill${form.valid ? " status-pill--valid" : ""}` },
      form.valid ? "Valid" : "Needs input",
    ),
    h("span", { className: "status-pill" }, form.dirty ? "Edited" : "Pristine"),
  );
}

function ManualField({ field, fieldProps, formId }) {
  const specification = fieldSpecifications[field.name];
  const { caption, label, ...controlProps } = specification;
  const inputId = `${formId}-${field.name}`;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  const errorMessage = visibleIssue(field);

  // The form library supplies this headless parameter object. The application
  // decides which DOM element consumes it and how the field is laid out.
  const { name, onBlur, onChange, onFocus, value } = fieldProps;

  return h(
    "div",
    {
      className: `field-shell${errorMessage ? " field-shell--invalid" : ""}`,
    },
    h(
      "div",
      { className: "field-label-row" },
      h("label", { className: "field-label", htmlFor: inputId }, label),
      h("span", { className: "field-mode" }, "headless"),
    ),
    h("input", {
      ...controlProps,
      "aria-describedby": errorMessage ? errorId : helpId,
      "aria-invalid": errorMessage.length > 0,
      className: "field-control",
      id: inputId,
      name,
      onBlur,
      onChange,
      onFocus,
      value,
    }),
    errorMessage
      ? h(
          "p",
          { className: "field-message field-message--error", id: errorId },
          errorMessage,
        )
      : h("p", { className: "field-message", id: helpId }, caption),
  );
}

function FormButtons({ form }) {
  return h(
    "div",
    { className: "form-actions" },
    h(
      "button",
      {
        className: "button button--quiet",
        disabled: form.pristine || form.submitting,
        form: form.formId,
        type: "reset",
      },
      "Reset",
    ),
    h(
      "button",
      {
        className: "button button--primary",
        disabled: form.submitting,
        form: form.formId,
        type: "submit",
      },
      form.submitting ? "Adding…" : "Add to shared list",
    ),
  );
}

function FormHeader({ description, form, mode, title }) {
  return h(
    React.Fragment,
    null,
    h(
      "div",
      { className: "panel-heading" },
      h(
        "div",
        null,
        h("p", { className: "section-kicker" }, "Static form slice"),
        h("h2", null, title),
      ),
      h("code", { className: "form-id" }, `#${form.formId}`),
    ),
    h("p", { className: "panel-description" }, description),
    h(StatusPills, { form, mode }),
  );
}

function HeadlessForm({ form }) {
  return h(
    "section",
    {
      "aria-labelledby": "tab-fields",
      className: "form-panel",
      id: "panel-fields",
      role: "tabpanel",
    },
    h(FormHeader, {
      description:
        "Zustik Form exposes named, ready-to-spread fieldProps; this tab owns every label, input, and validation message.",
      form,
      mode: `${Object.keys(form.fieldProps).length} named prop bindings`,
      title: "Render from fieldProps",
    }),
    h(
      "form",
      { ...form.formProps, noValidate: true },
      h(
        "div",
        { className: "field-grid" },
        Object.keys(form.fields).map((name) =>
          h(ManualField, {
            field: form.fields[name],
            fieldProps: form.fieldProps[name],
            formId: form.formId,
            key: name,
          }),
        ),
      ),
    ),
    h(FormButtons, { form }),
  );
}

function ComponentsForm({ form }) {
  const { name, price, quantity, storeName } = form.components;

  return h(
    "section",
    {
      "aria-labelledby": "tab-components",
      className: "form-panel",
      id: "panel-components",
      role: "tabpanel",
    },
    h(FormHeader, {
      description:
        "Each field definition carries a component and its static props. The library returns named, fully bound React elements with no render-time props.",
      form,
      mode: `${Object.keys(form.components).length} named components`,
      title: "Render generated components",
    }),
    h(
      "form",
      { ...form.formProps, noValidate: true },
      h("div", { className: "field-grid" }, name, price, quantity, storeName),
    ),
    h(FormButtons, { form }),
  );
}

function Tabs({ activeTab, onChange }) {
  const tabs = [
    { id: "fields", label: "Field parameters", short: "01" },
    { id: "components", label: "Generated components", short: "02" },
  ];

  function onKeyDown(event, index) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + direction + tabs.length) % tabs.length;
    onChange(tabs[nextIndex].id);
    document.getElementById(`tab-${tabs[nextIndex].id}`)?.focus();
  }

  return h(
    "div",
    { "aria-label": "Rendering approach", className: "tabs", role: "tablist" },
    tabs.map((tab, index) =>
      h(
        "button",
        {
          "aria-controls": `panel-${tab.id}`,
          "aria-selected": activeTab === tab.id,
          className: `tab${activeTab === tab.id ? " tab--active" : ""}`,
          id: `tab-${tab.id}`,
          key: tab.id,
          onClick: () => onChange(tab.id),
          onKeyDown: (event) => onKeyDown(event, index),
          role: "tab",
          tabIndex: activeTab === tab.id ? 0 : -1,
          type: "button",
        },
        h("span", { className: "tab-number" }, tab.short),
        h("span", null, tab.label),
      ),
    ),
  );
}

const currency = new Intl.NumberFormat("en-US", {
  currency: "USD",
  style: "currency",
});

function GroceryList({ groceries, onClear, onRemove }) {
  const total = groceries.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  return h(
    "aside",
    { "aria-labelledby": "list-title", className: "list-card" },
    h(
      "div",
      { className: "list-heading" },
      h(
        "div",
        null,
        h("p", { className: "section-kicker" }, "Shared store state"),
        h("h2", { id: "list-title" }, "Grocery list"),
      ),
      h("span", { className: "count-badge" }, String(groceries.length)),
    ),
    groceries.length === 0
      ? h(
          "div",
          { className: "empty-state" },
          h("span", { "aria-hidden": true, className: "empty-state-icon" }, "＋"),
          h("h3", null, "Your basket is open"),
          h(
            "p",
            null,
            "Submit either form. Both tabs write into this same Zustand slice.",
          ),
        )
      : h(
          React.Fragment,
          null,
          h(
            "ol",
            { className: "grocery-list" },
            groceries.map((item) =>
              h(
                "li",
                { className: "grocery-item", key: item.id },
                h(
                  "div",
                  { className: "item-main" },
                  h(
                    "div",
                    { className: "item-name-row" },
                    h("h3", null, item.name),
                    h(
                      "button",
                      {
                        "aria-label": `Remove ${item.name}`,
                        className: "remove-button",
                        onClick: () => onRemove(item.id),
                        title: "Remove item",
                        type: "button",
                      },
                      "×",
                    ),
                  ),
                  h(
                    "p",
                    { className: "item-meta" },
                    `${item.quantity} × ${currency.format(item.price)} · ${item.storeName}`,
                  ),
                  h(
                    "div",
                    { className: "item-origin" },
                    h("span", null, item.source),
                    h("code", null, item.formId),
                  ),
                ),
                h(
                  "strong",
                  { className: "item-total" },
                  currency.format(item.price * item.quantity),
                ),
              ),
            ),
          ),
          h(
            "div",
            { className: "list-summary" },
            h(
              "div",
              null,
              h("span", null, "Estimated total"),
              h("strong", null, currency.format(total)),
            ),
            h(
              "button",
              { className: "clear-button", onClick: onClear, type: "button" },
              "Clear list",
            ),
          ),
        ),
  );
}

function ArchitectureStrip() {
  return h(
    "div",
    { className: "architecture-strip", role: "note" },
    h("span", { className: "live-dot" }),
    h("strong", null, "One vanilla store"),
    h("span", { "aria-hidden": true }, "→"),
    h("code", null, "zustikFormgroceryFields"),
    h("span", { "aria-hidden": true }, "+"),
    h("code", null, "zustikFormgroceryComponents"),
    h("span", { "aria-hidden": true }, "+"),
    h("span", null, "shared groceries"),
  );
}

function App() {
  const state = useGroceryStore();
  const fieldsForm = state.zustikFormgroceryFields;
  const componentsForm = state.zustikFormgroceryComponents;

  return h(
    React.Fragment,
    null,
    h(
      "header",
      { className: "hero" },
      h(
        "div",
        { className: "hero-copy" },
        h(
          "p",
          { className: "eyebrow" },
          h("span", { className: "eyebrow-mark" }, "ZF"),
          "No-bundler browser sandbox",
        ),
        h(
          "h1",
          null,
          "One list. Two ways to ",
          h("em", null, "build the form."),
        ),
        h(
          "p",
          { className: "hero-description" },
          "Two static form factories compose into one global Zustand store. React 18 renders either named field props or fully bound elements created under the hood.",
        ),
      ),
      h(
        "div",
        { className: "stack-stamp", "aria-label": "Runtime stack" },
        h("span", null, "React 18.3.1"),
        h("span", null, "Final Form"),
        h("span", null, "Valibot"),
        h("span", null, "Zustand"),
      ),
    ),
    h(
      "main",
      { className: "page-shell" },
      h(ArchitectureStrip),
      h(
        "p",
        { "aria-live": "polite", className: "notice" },
        state.notice,
      ),
      h(
        "div",
        { className: "workspace" },
        h(
          "div",
          { className: "form-card" },
          h(Tabs, { activeTab: state.activeTab, onChange: state.setActiveTab }),
          state.activeTab === "fields"
            ? h(HeadlessForm, { form: fieldsForm })
            : h(ComponentsForm, { form: componentsForm }),
        ),
        h(GroceryList, {
          groceries: state.groceries,
          onClear: state.clearGroceries,
          onRemove: state.removeGrocery,
        }),
      ),
    ),
    h(
      "footer",
      { className: "page-footer" },
      h("span", null, "Native ESM · no JSX · no bundler · no network"),
      h("span", null, "Open groceryStore in DevTools to inspect the live state."),
    ),
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  h(React.StrictMode, null, h(App)),
);
