// Imperative confirm()/prompt() service backing ConfirmDialog.jsx's host
// component - split into its own module because a file that exports both
// a component and plain functions breaks React Fast Refresh (see
// react-refresh/only-export-components).
let dispatch = null;

export function registerDialogDispatch(fn) {
  dispatch = fn;
}

export function confirmAction(message, opts = {}) {
  return new Promise((resolve) => {
    if (!dispatch) { resolve(window.confirm(message)); return; }
    dispatch({ kind: "confirm", message, opts, resolve });
  });
}

export function promptAction(message, opts = {}) {
  return new Promise((resolve) => {
    if (!dispatch) { resolve(window.prompt(message, opts.defaultValue || "")); return; }
    dispatch({ kind: "prompt", message, opts, resolve });
  });
}
