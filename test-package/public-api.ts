import * as v from "valibot";
import { createStore } from "zustand/vanilla";

import {
  createZustikFormSlice,
  type InputOf,
  type ZustikFormSlice,
} from "zustik-form";

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
