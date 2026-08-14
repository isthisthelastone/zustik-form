const FinalForm = globalThis.FinalForm;

if (FinalForm === undefined) {
  throw new Error(
    "Final Form did not initialize. Load final-form.umd.js before this module.",
  );
}

export const ARRAY_ERROR = FinalForm.ARRAY_ERROR;
export const FORM_ERROR = FinalForm.FORM_ERROR;
export const configOptions = FinalForm.configOptions;
export const createForm = FinalForm.createForm;
export const fieldSubscriptionItems = FinalForm.fieldSubscriptionItems;
export const formSubscriptionItems = FinalForm.formSubscriptionItems;
export const getIn = FinalForm.getIn;
export const setIn = FinalForm.setIn;
export const version = FinalForm.version;
