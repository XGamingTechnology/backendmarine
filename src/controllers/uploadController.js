// src/controllers/uploadController.js
const uploadController = {
  importShp: (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json({ message: "SHP received", filename: req.file.filename });
  },
  importExcel: (req, res) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    res.json({ message: "Excel received", filename: req.file.filename });
  },
};

export default uploadController;
