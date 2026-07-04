import { createNotification } from "./notification.service.js";

export async function notify({
  type,
  title,
  message,
  priority = "medium",
  meta = {},
}) {
  try {
    await createNotification({
      type,
      title,
      message,
      priority,
      meta,
      userId: "system",
    });
  } catch (err) {
    console.log("Notification Error:", err.message);
  }
}