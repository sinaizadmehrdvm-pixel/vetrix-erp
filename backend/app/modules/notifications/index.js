import routes from "./notification.routes.js";

export default function notificationModule(app) {
  app.use("/api/notifications", routes);
}