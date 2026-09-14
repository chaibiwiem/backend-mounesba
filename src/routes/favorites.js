const express = require('express');
const favoriteController = require('../controllers/favoriteController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(verifyToken, requireRole('client'));

router.get('/me', favoriteController.getMyFavorites);
router.post('/', favoriteController.addFavorite);
router.delete('/:listingId', favoriteController.removeFavorite);

module.exports = router;
