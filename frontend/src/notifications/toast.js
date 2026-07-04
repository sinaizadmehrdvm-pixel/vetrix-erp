import toast from "react-hot-toast";

export const successToast = (msg) => {
  toast.success(msg, {
    style: {
      background: "#0f172a",
      color: "#fff",
      border: "1px solid rgba(255,255,255,0.08)",
    },
  });
};

export const errorToast = (msg) => {
  toast.error(msg, {
    style: {
      background: "#7f1d1d",
      color: "#fff",
    },
  });
};