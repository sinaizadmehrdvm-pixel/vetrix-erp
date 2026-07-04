import Notification from "./notification.model.js";

export async function createNotification({
  type,
  title,
  message,
  priority = "medium",
  userId = "system",
  meta = {},
}) {
  return await Notification.create({
    type,
    title,
    message,
    priority,
    userId,
    meta,
  });
}

export async function getNotifications(limit = 50) {
  return await Notification.find()
    .sort({ createdAt: -1 })
    .limit(limit);
}

export async function markAsRead(id) {
  return await Notification.findByIdAndUpdate(id, { read: true });
}