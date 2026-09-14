const express = require('express');
const availabilityController = require('../controllers/availabilityController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/', verifyToken, requireRole('provider'), availabilityController.upsertAvailability);
router.delete('/:id', verifyToken, requireRole('provider'), availabilityController.deleteAvailability);

module.exports = router;
