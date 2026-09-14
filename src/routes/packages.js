const express = require('express');
const packageController = require('../controllers/packageController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.post('/', verifyToken, requireRole('provider'), packageController.createPackage);
router.patch('/:id', verifyToken, requireRole('provider'), packageController.updatePackage);
router.delete('/:id', verifyToken, requireRole('provider'), packageController.deletePackage);

module.exports = router;
