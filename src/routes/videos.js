const express = require('express');
const videoController = require('../controllers/videoController');
const { verifyToken, requireRole } = require('../middleware/auth');
const { uploadThumbnailOnly } = require('../middleware/upload');

const router = express.Router();

router.patch(
  '/:id',
  verifyToken,
  requireRole('provider'),
  uploadThumbnailOnly.fields([{ name: 'thumbnail', maxCount: 1 }]),
  videoController.updateVideo
);
router.delete('/:id', verifyToken, requireRole('provider'), videoController.deleteVideo);

module.exports = router;
