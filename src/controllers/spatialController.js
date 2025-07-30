const spatialController = {
  getAll: (req, res) => {
    res.json({ message: "GET /spatial -> ready" });
  },
  getById: (req, res) => {
    res.json({ message: "GET /spatial/:id -> ready" });
  },
  create: (req, res) => {
    res.json({ message: "POST /spatial -> ready" });
  },
  update: (req, res) => {
    res.json({ message: "PUT /spatial/:id -> ready" });
  },
  delete: (req, res) => {
    res.json({ message: "DELETE /spatial/:id -> ready" });
  },
};

module.exports = spatialController;
