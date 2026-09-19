const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const cityRoutes = require('./routes/cities');
const listingRoutes = require('./routes/listings');
const leadRoutes = require('./routes/leads');
const imageRoutes = require('./routes/images');
const videoRoutes = require('./routes/videos');
const packageRoutes = require('./routes/packages');
const availabilityRoutes = require('./routes/availability');
const promotionRoutes = require('./routes/promotions');
const clientRoutes = require('./routes/clients');
const contractRoutes = require('./routes/contracts');
const invoiceRoutes = require('./routes/invoices');
const reviewRoutes = require('./routes/reviews');
const bookingRoutes = require('./routes/bookings');
const subscriptionRoutes = require('./routes/subscriptions');
const favoriteRoutes = require('./routes/favorites');
const vehicleRoutes = require('./routes/vehicles');
const vehicleBookingRoutes = require('./routes/vehicleBookings');
const vehicleDecorationRoutes = require('./routes/vehicleDecorations');
const vehicleOptionRoutes = require('./routes/vehicleOptions');
const providerEventRoutes = require('./routes/providerEvents');
const adminRoutes = require('./routes/admin');
const errorHandler = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');

const app = express();

// CORS avec liste blanche de domaines (jamais * en production) — CLAUDE.md
// Tolere espaces, guillemets et "/" final dans les valeurs saisies.
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(/[,\s]+/)
  .map((o) => o.replace(/^["']|["']$/g, '').replace(/\/+$/, ''))
  .filter(Boolean);

// cross-origin : le frontend (autre domaine) affiche les images /uploads du backend
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : false,
    credentials: true,
  })
);
app.use(express.json());
app.use(generalLimiter);

// Certains hebergeurs mutualises (cPanel/Passenger) exposent l'app derriere
// un sous-chemin (ex. /mounesba) sans le retirer de l'URL transmise a
// Express - toutes les routes sont donc montees sous ce prefixe, vide par
// defaut (Vercel, dev local) pour ne rien changer ailleurs.
const basePath = process.env.BASE_PATH || '';
const router = express.Router();

// Galerie prestataire (photos publiques) — les documents legaux sensibles ne
// transiteront jamais par ce dossier statique (CLAUDE.md, section Uploads).
router.use('/uploads', express.static(path.join(__dirname, '../uploads')));

router.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'mounesba-backend' });
});

router.use('/api/auth', authRoutes);
router.use('/api/categories', categoryRoutes);
router.use('/api/cities', cityRoutes);
router.use('/api/listings', listingRoutes);
router.use('/api/leads', leadRoutes);
router.use('/api/images', imageRoutes);
router.use('/api/videos', videoRoutes);
router.use('/api/packages', packageRoutes);
router.use('/api/availability', availabilityRoutes);
router.use('/api/promotions', promotionRoutes);
router.use('/api/clients', clientRoutes);
router.use('/api/contracts', contractRoutes);
router.use('/api/invoices', invoiceRoutes);
router.use('/api/reviews', reviewRoutes);
router.use('/api/bookings', bookingRoutes);
router.use('/api/subscriptions', subscriptionRoutes);
router.use('/api/favorites', favoriteRoutes);
router.use('/api/vehicles', vehicleRoutes);
router.use('/api/vehicle_bookings', vehicleBookingRoutes);
router.use('/api/vehicle-decorations', vehicleDecorationRoutes);
router.use('/api/vehicle-options', vehicleOptionRoutes);
router.use('/api/events', providerEventRoutes);
router.use('/api/admin', adminRoutes);

app.use(basePath, router);
app.use(errorHandler);

module.exports = app;
