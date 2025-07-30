const express = require('express');
const router = express.Router();

// Hanya untuk dokumentasi
// GraphQL biasanya di-apply langsung ke app di server.js
router.get('/', (req, res) => {
  res.send('GraphQL endpoint: use POST /graphql');
});

module.exports = router;
