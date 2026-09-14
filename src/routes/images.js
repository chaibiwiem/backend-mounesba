const express = require('express');
const imageController = require('../controllers/imageController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.patch('/:id/primary', verifyToken, requireRole('provider'), imageController.setPrimaryImage);
router.delete('/:id', verifyToken, requireRole('provider'), imageController.deleteImage);

module.exports = router;
