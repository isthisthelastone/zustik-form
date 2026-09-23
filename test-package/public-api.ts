import { createStore } from "zustand/vanilla";

import {
  createZustikFormSlice,
  type InputOf,
  type ManualZustikFormSlice,
  type ZustikFormSlice,
} from "zustik-form";
import * as v from "zustik-form/valibot";

interface HostStore {
  saved: string;
  save(value: string): void;
}

const createPackageSmokeFormSlice = createZustikFormSlice<HostStore>()({
  defaultValues: { value: "" },
  fields: { value: {} },
  formPostfix: "PackageSmoke",
  onSubmit: (values, { get, set, store }) => {
    const value: string = values.value;
    get().save(value);
    set({ saved: store.getState().saved });
  },
  validationSchema: v.object({ value: v.string() }),
});

type State = HostStore & ZustikFormSlice<typeof createPackageSmokeFormSlice>;
type Values = InputOf<typeof createPackageSmokeFormSlice>;

const store = createStore<State>()((set, get, api) => ({
  saved: "",
  save: (saved) => set({ saved }),
  ...createPackageSmokeFormSlice(set, get, api),
}));

const values: Readonly<Values> =
  store.getState().zustikFormPackageSmoke.values;
void values;

type InlineState = ManualZustikFormSlice<{
  readonly defaultValues: { readonly title: string };
  readonly fields: { readonly title: {} };
  readonly formPostfix: "InlinePackageSmoke";
}>;

const inlineStore = createStore<InlineState>()((set, get, api) => ({
  ...createZustikFormSlice({
    defaultValues: { title: "" },
    fields: { title: {} },
    formPostfix: "InlinePackageSmoke",
    onSubmit: () => undefined,
  })(set, get, api),
}));

const inlineTitle: string =
  inlineStore.getState().zustikFormInlinePackageSmoke.values.title;
void inlineTitle;
