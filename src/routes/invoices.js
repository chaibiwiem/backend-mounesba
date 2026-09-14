const express = require('express');
const invoiceController = require('../controllers/invoiceController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', verifyToken, requireRole('provider'), invoiceController.getInvoices);
router.post('/', verifyToken, requireRole('provider'), invoiceController.createInvoice);
router.patch('/:id', verifyToken, requireRole('provider'), invoiceController.updateInvoice);
router.patch('/:id/status', verifyToken, requireRole('provider'), invoiceController.updateInvoiceStatus);
router.post('/:id/send', verifyToken, requireRole('provider'), invoiceController.sendInvoice);

module.exports = router;
