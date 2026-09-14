const express = require('express');
const { body } = require('express-validator');
const bookingController = require('../controllers/bookingController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const createBookingValidators = [
  body('leadId').optional({ checkFalsy: true }).isInt().withMessage('Demande invalide.').toInt(),
  body('clientId').optional({ checkFalsy: true }).isInt().withMessage('Client invalide.').toInt(),
  body('clientName').optional({ checkFalsy: true }).trim().isLength({ max: 160 }),
  body('clientEmail').optional({ checkFalsy: true }).isEmail().withMessage('Email invalide.').normalizeEmail(),
  body('clientPhone').optional({ checkFalsy: true }).trim().isLength({ max: 20 }),
  body('eventDate').optional({ checkFalsy: true }).isISO8601().withMessage('Date invalide.'),
  body('startTime')
    .optional({ checkFalsy: true })
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    .withMessage("Heure de début invalide (format HH:MM)."),
  body('endTime')
    .optional({ checkFalsy: true })
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    .withMessage("Heure de fin invalide (format HH:MM)."),
  body('totalPrice').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Montant invalide.'),
  body('deposit').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Acompte invalide.'),
  body('paymentMethod').optional({ checkFalsy: true }).isIn(['cash', 'rib']).withMessage('Mode de règlement invalide.'),
  body('status').optional({ checkFalsy: true }).isIn(['pending', 'confirmed', 'completed', 'cancelled']),
  body('notes').optional({ checkFalsy: true }).isLength({ max: 2000 }),
];

const updateBookingValidators = [
  body('eventDate').optional({ checkFalsy: true }).isISO8601().withMessage('Date invalide.'),
  body('startTime')
    .optional({ checkFalsy: true })
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    .withMessage("Heure de début invalide (format HH:MM)."),
  body('endTime')
    .optional({ checkFalsy: true })
    .matches(/^([01]\d|2[0-3]):[0-5]\d$/)
    .withMessage("Heure de fin invalide (format HH:MM)."),
  body('totalPrice').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Montant invalide.'),
  body('deposit').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Acompte invalide.'),
  body('paymentMethod').optional({ checkFalsy: true }).isIn(['cash', 'rib']).withMessage('Mode de règlement invalide.'),
  body('status').optional({ checkFalsy: true }).isIn(['pending', 'confirmed', 'completed', 'cancelled']),
  body('notes').optional({ checkFalsy: true }).isLength({ max: 2000 }),
];

router.get('/me', verifyToken, bookingController.getMyBookings);
router.post(
  '/',
  verifyToken,
  requireRole('provider'),
  createBookingValidators,
  bookingController.createBooking
);
router.patch(
  '/:id',
  verifyToken,
  requireRole('provider'),
  updateBookingValidators,
  bookingController.updateBooking
);
router.patch(
  '/:id/status',
  verifyToken,
  requireRole('provider'),
  body('status').notEmpty().isIn(['pending', 'confirmed', 'completed', 'cancelled']),
  bookingController.updateBookingStatus
);
router.delete('/:id', verifyToken, requireRole('provider'), bookingController.deleteBooking);

module.exports = router;
