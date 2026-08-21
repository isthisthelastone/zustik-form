import * as v from "valibot";
import { createStore } from "zustand/vanilla";

import {
  createZustikFormSlice,
  type InputOf,
  type ZustikFormSlice,
} from "zustik-form";

const createPackageSmokeFormSlice = createZustikFormSlice({
  defaultValues: { value: "" },
  fields: { value: {} },
  formPostfix: "PackageSmoke",
  onSubmit: (values) => {
    const value: string = values.value;
    void value;
  },
  validationSchema: v.object({ value: v.string() }),
});

type State = ZustikFormSlice<typeof createPackageSmokeFormSlice>;
type Values = InputOf<typeof createPackageSmokeFormSlice>;

const store = createStore<State>()((set, get, api) =>
  createPackageSmokeFormSlice(set, get, api),
);

const values: Readonly<Values> =
  store.getState().zustikFormPackageSmoke.values;
void values;
