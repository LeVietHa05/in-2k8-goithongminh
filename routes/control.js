const express = require("express");
const router = express.Router();

// chỉ lưu 1 lệnh mới nhất
let command = { device: "", state: 0 };

// nhận lệnh từ app
router.post("/", (req, res) => {
  const { device, state } = req.body;

  if (!device || state === undefined) {
    return res.status(400).json({ message: "Missing data" });
  }

  command = { device, state };

  console.log(`📥 Lệnh: ${device} = ${state}`);

  res.json({ success: true });
});

// ESP lấy lệnh
router.get("/esp", (req, res) => {
  res.json(command);
});

module.exports = router;