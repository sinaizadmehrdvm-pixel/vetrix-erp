import { forwardRef } from "react";
import Button from "./Button";

const SIZE_CLASSES = {
  default: "!w-11 !h-11 !min-h-11 !p-0",
  sm: "!w-9 !h-9 !min-h-9 !p-0",
};

// Square icon-only button - always centers its icon via Button's own
// inline-flex items-center/justify-center, so it can't drift off-center
// the way ad hoc icon buttons did across the app before this component
// existed.
const IconButton = forwardRef(function IconButton(
  { icon: Icon, size = "default", label, className = "", loading = false, ...rest },
  ref
) {
  return (
    <Button
      ref={ref}
      loading={loading}
      aria-label={label}
      title={label}
      className={[SIZE_CLASSES[size], "!gap-0", className].join(" ")}
      {...rest}
    >
      {!loading && Icon ? (
        <Icon size={size === "sm" ? 15 : 17} className="shrink-0" />
      ) : null}
    </Button>
  );
});

export default IconButton;
