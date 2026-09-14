const rateLimit = require('express-rate-limit');

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});

// Anti brute-force sur /login et /register (CLAUDE.md - section Sécurité)
// Seuils volontairement permissifs pour ne pas gêner les tests manuels/dev ;
// à resserrer avant mise en production réelle.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Trop de tentatives. Veuillez réessayer plus tard.' },
});

// Anti-spam sur /api/leads (utilisé en Phase 4)
const leadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Trop de demandes envoyées. Veuillez réessayer plus tard.' },
});

// Anti-spam sur POST /api/reviews : ouvert aux visiteurs anonymes (avis sans
// reservation), meme logique de protection que leadLimiter.
const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Trop d\'avis envoyés. Veuillez réessayer plus tard.' },
});

module.exports = { generalLimiter, authLimiter, leadLimiter, reviewLimiter };
