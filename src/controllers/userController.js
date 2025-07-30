const userController = {
  getAll: (req, res) => {
    res.json({ message: "GET /users -> ready" });
  },
  getById: (req, res) => {
    res.json({ message: "GET /users/:id -> ready" });
  },
  updateProfile: (req, res) => {
    res.json({ message: "PUT /users/:id -> ready" });
  },
  deleteUser: (req, res) => {
    res.json({ message: "DELETE /users/:id -> ready" });
  },
};

module.exports = userController;
