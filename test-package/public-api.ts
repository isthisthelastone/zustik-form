import * as v from "valibot";
import { createStore } from "zustand/vanilla";

import {
  defineZustikForm,
  zustikFormCreate,
  type InputOf,
  type ZustikFormSlice,
} from "zustik-form";

const schema = v.object({ value: v.string() });
const definition = defineZustikForm({
  defaultValues: { value: "" },
  fields: [{ name: "value" }] as const,
  formPostfix: "PackageSmoke",
  onSubmit: (values) => {
    const value: string = values.value;
    void value;
  },
  validationSchema: schema,
});

type Forms = { PackageSmoke: typeof definition };
type State = ZustikFormSlice<Forms>;
type Values = InputOf<typeof definition>;

const slice = zustikFormCreate<Forms, State>();
const store = createStore<State>()((set, get, api) =>
  slice(set, get, api),
);
store.getState().createForm(definition);

const values: Readonly<Values> =
  store.getState().zustikFormPackageSmoke?.form.values ?? { value: "" };
void values;
