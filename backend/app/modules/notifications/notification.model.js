import mongoose from "mongoose";

const NotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "invoice",
        "payment",
        "customer",
        "inventory",
        "system",
        "reminder",
      ],
      required: true,
    },

    title: String,
    message: String,

    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },

    read: {
      type: Boolean,
      default: false,
    },

    userId: {
      type: String,
      default: "system",
    },

    meta: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true }
);

export default mongoose.model("Notification", NotificationSchema);