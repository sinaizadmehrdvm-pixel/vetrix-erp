import { useCallback, useLayoutEffect, useRef } from "react";

export function useStableCallback(callback) {
  const callbackRef = useRef(callback);
  useLayoutEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  return useCallback((...args) => callbackRef.current(...args), []);
}
