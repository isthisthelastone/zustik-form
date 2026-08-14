const React = globalThis.React;

if (React?.version !== "18.3.1") {
  throw new Error(
    `This example requires React 18.3.1; received ${React?.version ?? "no React runtime"}.`,
  );
}

export const Children = React.Children;
export const Fragment = React.Fragment;
export const StrictMode = React.StrictMode;
export const cloneElement = React.cloneElement;
export const createContext = React.createContext;
export const createElement = React.createElement;
export const createRef = React.createRef;
export const forwardRef = React.forwardRef;
export const isValidElement = React.isValidElement;
export const memo = React.memo;
export const useCallback = React.useCallback;
export const useEffect = React.useEffect;
export const useId = React.useId;
export const useMemo = React.useMemo;
export const useRef = React.useRef;
export const useState = React.useState;
export const useSyncExternalStore = React.useSyncExternalStore;
export const version = React.version;
export default React;
