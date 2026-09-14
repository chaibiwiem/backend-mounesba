const express = require('express');
const reviewController = require('../controllers/reviewController');
const { verifyToken, requireRole, optionalAuth } = require('../middleware/auth');
const { reviewLimiter } = require('../middleware/rateLimiter');
const { upload } = require('../middleware/upload');

const router = express.Router();

// Ouvert aux visiteurs anonymes ET aux clients connectes (avis avec ou sans
// reservation - decision produit) : optionalAuth ne bloque jamais la requete.
router.post('/', reviewLimiter, optionalAuth, upload.array('photos', 5), reviewController.createReview);
router.patch('/:id/reply', verifyToken, requireRole('provider'), reviewController.replyToReview);
router.patch('/:id/verify', verifyToken, requireRole('provider'), reviewController.verifyReview);
router.post('/:id/report', verifyToken, reviewController.reportReview);

module.exports = router;
