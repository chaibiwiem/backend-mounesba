const express = require('express');
const contractController = require('../controllers/contractController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', verifyToken, requireRole('provider'), contractController.getContracts);
router.post('/', verifyToken, requireRole('provider'), contractController.createContract);
router.patch('/:id', verifyToken, requireRole('provider'), contractController.updateContract);
router.post('/:id/send', verifyToken, requireRole('provider'), contractController.sendContract);

module.exports = router;
