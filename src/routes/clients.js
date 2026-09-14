const express = require('express');
const clientController = require('../controllers/clientController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

// /export doit etre declare avant /:id pour ne pas etre capture par le parametre.
router.get('/export', verifyToken, requireRole('provider'), clientController.exportClients);
router.get('/', verifyToken, requireRole('provider'), clientController.getClients);
router.get('/:id', verifyToken, requireRole('provider'), clientController.getClient);
router.patch('/:id', verifyToken, requireRole('provider'), clientController.updateClient);
router.patch(
  '/:id/clear-manual-tag',
  verifyToken,
  requireRole('provider'),
  clientController.clearManualTag
);
router.delete('/:id', verifyToken, requireRole('provider'), clientController.deleteClient);

module.exports = router;
