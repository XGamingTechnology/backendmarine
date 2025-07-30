// src/controllers/authController.js
const authController = {
  login: (req, res) => {
    res.json({ message: "Login endpoint ready" });
  },
  register: (req, res) => {
    res.json({ message: "Register endpoint ready" });
  },
};

export default authController;
