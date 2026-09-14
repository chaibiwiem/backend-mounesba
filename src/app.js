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
const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : false,
    credentials: true,
  })
);
app.use(express.json());
app.use(generalLimiter);

// Galerie prestataire (photos publiques) — les documents legaux sensibles ne
// transiteront jamais par ce dossier statique (CLAUDE.md, section Uploads).
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/cities', cityRoutes);
app.use('/api/listings', listingRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/favorites', favoriteRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/vehicle_bookings', vehicleBookingRoutes);
app.use('/api/vehicle-decorations', vehicleDecorationRoutes);
app.use('/api/vehicle-options', vehicleOptionRoutes);
app.use('/api/events', providerEventRoutes);
app.use('/api/admin', adminRoutes);

app.use(errorHandler);

module.exports = app;
