const express = require('express');
const promotionController = require('../controllers/promotionController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/', verifyToken, requireRole('provider'), promotionController.createPromotion);
router.patch('/:id', verifyToken, requireRole('provider'), promotionController.updatePromotion);
router.delete('/:id', verifyToken, requireRole('provider'), promotionController.deletePromotion);

module.exports = router;
