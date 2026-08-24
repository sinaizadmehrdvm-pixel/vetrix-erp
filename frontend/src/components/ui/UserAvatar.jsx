import { useState } from "react";

// A distinct, deterministic-per-name colored circle (GitHub/Slack-style)
// as the fallback for anyone without an uploaded photo yet, so the profile
// widget never shows a generic gray placeholder - every person reads as a
// distinct identity at a glance, with or without a real photo. Colors come
// from the --erp-avatar-* tokens in index.css (constant across themes, see
// that file's comment for why).
const AVATAR_COLOR_TOKENS = [
  "--erp-avatar-1", "--erp-avatar-2", "--erp-avatar-3", "--erp-avatar-4",
  "--erp-avatar-5", "--erp-avatar-6", "--erp-avatar-7", "--erp-avatar-8",
];

function colorForName(name) {
  const str = (name || "").trim();
  if (!str) return `var(${AVATAR_COLOR_TOKENS[0]})`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return `var(${AVATAR_COLOR_TOKENS[hash % AVATAR_COLOR_TOKENS.length]})`;
}

function initialsForName(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function UserAvatar({ name, avatarData, size = 36, className = "", style = {} }) {
  // Tracks the specific src that failed to load (not just a bare boolean)
  // so a later, different avatarData value naturally clears the broken
  // state again without needing an effect to resync it.
  const [failedSrc, setFailedSrc] = useState(null);

  const shared = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: Math.max(10, Math.round(size * 0.38)),
    overflow: "hidden",
    ...style,
  };

  if (avatarData && avatarData !== failedSrc) {
    return (
      <img
        src={avatarData}
        alt={name || ""}
        className={className}
        style={{ ...shared, objectFit: "cover" }}
        onError={() => setFailedSrc(avatarData)}
      />
    );
  }

  return (
    <span
      className={className}
      style={{ ...shared, background: colorForName(name), color: "var(--erp-avatar-initials-text)" }}
      aria-hidden="true"
    >
      {initialsForName(name)}
    </span>
  );
}
