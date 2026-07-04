import express from "express";
import {
  createNotification,
  getNotifications,
  markAsRead,
} from "./notification.service.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const data = await getNotifications();
  res.json(data);
});

router.post("/", async (req, res) => {
  const result = await createNotification(req.body);
  res.json(result);
});

router.patch("/:id/read", async (req, res) => {
  const result = await markAsRead(req.params.id);
  res.json(result);
});

export default router;