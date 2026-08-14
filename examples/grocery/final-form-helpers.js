(function installFinalFormHelpers(globalObject) {
  "use strict";

  globalObject._extends = function extend(target, ...sources) {
    return Object.assign(target, ...sources);
  };

  globalObject._objectWithoutPropertiesLoose = function withoutProperties(
    source,
    excluded,
  ) {
    if (source == null) return {};

    const target = {};
    for (const key in source) {
      if (
        Object.prototype.hasOwnProperty.call(source, key) &&
        !excluded.includes(key)
      ) {
        target[key] = source[key];
      }
    }
    return target;
  };
})(globalThis);
