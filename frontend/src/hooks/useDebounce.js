import { useEffect, useState } from "react";

// Returns `value`, but only updates after `delayMs` of no further changes -
// used to keep filter/search UI feeling instant (the input itself is never
// debounced) while the expensive filter/sort pass over the full list runs
// far less often.
export function useDebounce(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
