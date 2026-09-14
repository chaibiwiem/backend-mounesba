const express = require('express');
const { body } = require('express-validator');
const adminController = require('../controllers/adminController');
const categoryController = require('../controllers/categoryController');
const cityController = require('../controllers/cityController');
const subscriptionInvoiceController = require('../controllers/subscriptionInvoiceController');
const platformSettingsController = require('../controllers/platformSettingsController');
const { verifyToken, requireRole, requireAdminRole } = require('../middleware/auth');
const { upload, persistVerifiedImage, uploadIcon, persistVerifiedIcon } = require('../middleware/upload');
const { VALID_PLANS } = require('../services/planService');

const router = express.Router();

// Toutes les routes admin exigent le rôle admin (CLAUDE.md - Contrôle d'accès).
router.use(verifyToken, requireRole('admin'));

router.get('/providers/pending', adminController.getPendingProviders);
router.get('/providers/deleted', adminController.getDeletedProviders);
router.get('/providers', adminController.getAllProviders);

// Statistiques de reservations par prestataire (M10) : lecture seule, ouverte
// a tous les sous-roles admin (Super Admin, Moderateur, Support, Analyste) -
// donc pas de requireAdminRole(...) ici, seul le middleware admin de base
// (verifyToken + requireRole('admin')) s'applique.
router.get('/providers/stats', adminController.getProvidersStats);
router.get('/providers/:id/stats', adminController.getProviderStats);

router.patch('/providers/:listingId/review', adminController.reviewProvider);

const createProviderValidators = [
  body('firstName').trim().notEmpty().isLength({ max: 80 }).withMessage('Prénom requis.'),
  body('lastName').trim().notEmpty().isLength({ max: 80 }).withMessage('Nom requis.'),
  body('email').isEmail().withMessage('Email invalide.').normalizeEmail(),
  body('phone')
    .trim()
    .notEmpty()
    .matches(/^\+?\d{8,15}$/)
    .withMessage('Téléphone invalide.'),
  body('title').trim().notEmpty().isLength({ max: 160 }).withMessage("Le nom de l'entreprise est requis."),
  body('categoryId').notEmpty().withMessage('La catégorie est requise.').toInt(),
  body('city').optional({ checkFalsy: true }).isLength({ max: 100 }),
  body('address').optional({ checkFalsy: true }).isLength({ max: 255 }),
  body('description').optional({ checkFalsy: true }).isLength({ max: 5000 }),
  body('businessPhone')
    .optional({ checkFalsy: true })
    .matches(/^\+?\d{8,15}$/)
    .withMessage('Téléphone entreprise invalide.'),
  body('taxId').optional({ checkFalsy: true }).trim().isLength({ max: 40 }),
];

router.post(
  '/providers',
  upload.fields([
    { name: 'photos', maxCount: 20 },
    { name: 'cinDocument', maxCount: 1 },
  ]),
  createProviderValidators,
  adminController.createProvider
);

router.patch('/listings/:id/suspend', adminController.suspendListing);
router.patch('/listings/:id/reactivate', adminController.reactivateListing);

const updateProviderValidators = [
  body('title').optional().trim().notEmpty().isLength({ max: 160 }),
  body('description').optional({ checkFalsy: true }).isLength({ max: 5000 }),
  body('categoryId').optional().toInt(),
  body('city').optional({ checkFalsy: true }).isLength({ max: 100 }),
  body('address').optional({ checkFalsy: true }).isLength({ max: 255 }),
  body('phone')
    .optional({ checkFalsy: true })
    .matches(/^\+?\d{8,15}$/)
    .withMessage('Téléphone invalide.'),
  body('priceFrom').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
  body('priceTo').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
  body('avgSpent').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
  body('capacity').optional({ checkFalsy: true }).isInt({ min: 0 }).toInt(),
  body('website').optional({ checkFalsy: true }).isLength({ max: 200 }),
  body('facebookUrl').optional({ checkFalsy: true }).isLength({ max: 200 }),
  body('instagramUrl').optional({ checkFalsy: true }).isLength({ max: 200 }),
  body('yearsExperience').optional({ checkFalsy: true }).isInt({ min: 0 }).toInt(),
  body('languages').optional({ checkFalsy: true }).isLength({ max: 160 }),
];

// Modification libre d'une fiche : reservee au Super Admin.
router.patch(
  '/providers/:id',
  requireAdminRole(),
  updateProviderValidators,
  adminController.updateProvider
);

const updateProviderStatusValidators = [
  body('status').isIn(['active', 'suspended']).withMessage('Statut invalide.'),
  body('reason').optional({ checkFalsy: true }).isLength({ max: 255 }),
];

// Activer/desactiver : Super Admin + Moderateur.
router.patch(
  '/providers/:id/status',
  requireAdminRole('moderator'),
  updateProviderStatusValidators,
  adminController.updateProviderStatus
);

// Suppression (soft delete) et restauration : reservees au Super Admin.
router.delete('/providers/:id', requireAdminRole(), adminController.softDeleteProvider);
router.post('/providers/:id/restore', requireAdminRole(), adminController.restoreProvider);

const updateProviderSubscriptionValidators = [
  body('plan').isIn(VALID_PLANS).withMessage('Plan invalide.'),
  body('billingCycle').optional().isIn(['monthly', 'yearly']).withMessage('Cycle de facturation invalide.'),
  body('status').optional().isIn(['active', 'expired', 'cancelled']).withMessage('Statut invalide.'),
  body('startDate').optional({ checkFalsy: true }).isISO8601().withMessage('Date de début invalide.'),
  body('endDate').optional({ checkFalsy: true }).isISO8601().withMessage("Date d'expiration invalide."),
  body('price').optional({ checkFalsy: true }).isFloat({ min: 0 }).toFloat(),
  body('paymentReference').optional({ checkFalsy: true }).isLength({ max: 100 }),
  body('notes').optional({ checkFalsy: true }).isLength({ max: 2000 }),
];

// Attribution manuelle d'un plan (US-A05) : reservee au Super Admin (action financiere).
router.patch(
  '/providers/:id/subscription',
  requireAdminRole(),
  updateProviderSubscriptionValidators,
  adminController.updateProviderSubscription
);

router.get('/dashboard', adminController.getDashboardStats);

router.get('/disputes', adminController.getDisputes);
router.get('/disputes/:id', adminController.getDispute);
router.patch('/disputes/:id', adminController.updateDispute);

router.get('/reviews/reported', adminController.getReportedReviews);
router.patch('/reviews/:id/dismiss', adminController.dismissReviewReport);
router.delete('/reviews/:id', adminController.deleteReportedReview);

// --- Gestion des categories (structure de la plateforme) -------------------

router.get('/categories', categoryController.getCategoriesAdmin);

const categoryValidators = [
  body('name').trim().notEmpty().isLength({ max: 120 }).withMessage('Nom requis.'),
  body('slug')
    .trim()
    .notEmpty()
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug invalide (minuscules, chiffres, tirets uniquement).')
    .isLength({ max: 140 }),
  body('icon').optional({ checkFalsy: true }).isLength({ max: 80 }),
  body('parentId').optional({ checkFalsy: true }).isInt({ min: 1 }).toInt(),
  body('sortOrder').optional().isInt().toInt(),
];

const updateCategoryValidators = [
  body('name').optional().trim().notEmpty().isLength({ max: 120 }),
  body('slug')
    .optional()
    .trim()
    .notEmpty()
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Slug invalide (minuscules, chiffres, tirets uniquement).')
    .isLength({ max: 140 }),
  body('icon').optional({ checkFalsy: true }).isLength({ max: 80 }),
  body('parentId').optional({ checkFalsy: true }).isInt({ min: 1 }).toInt(),
  body('sortOrder').optional().isInt().toInt(),
  body('isActive').optional().isBoolean().toBoolean(),
];

// Structure de la plateforme : reservee au Super Admin.
router.post('/categories', requireAdminRole(), categoryValidators, categoryController.createCategory);
router.patch(
  '/categories/:id',
  requireAdminRole(),
  updateCategoryValidators,
  categoryController.updateCategory
);
router.delete('/categories/:id', requireAdminRole(), categoryController.deleteCategory);
router.post(
  '/categories/:id/image',
  requireAdminRole(),
  upload.single('image'),
  persistVerifiedImage,
  categoryController.uploadCategoryImage
);
router.delete('/categories/:id/image', requireAdminRole(), categoryController.deleteCategoryImage);
router.post(
  '/categories/:id/icon',
  requireAdminRole(),
  uploadIcon.single('icon'),
  persistVerifiedIcon,
  categoryController.uploadCategoryIcon
);
router.delete('/categories/:id/icon', requireAdminRole(), categoryController.deleteCategoryIcon);

// --- Services associes (liste informative FR/AR par categorie) -------------

const associatedServiceValidators = [
  body('nameFr').trim().notEmpty().isLength({ max: 160 }).withMessage('Nom (FR) requis.'),
  body('nameAr').optional({ checkFalsy: true }).isLength({ max: 160 }),
  body('sortOrder').optional().isInt().toInt(),
];

const updateAssociatedServiceValidators = [
  body('nameFr').optional().trim().notEmpty().isLength({ max: 160 }),
  body('nameAr').optional({ checkFalsy: true }).isLength({ max: 160 }),
  body('sortOrder').optional().isInt().toInt(),
];

// Structure de la plateforme : reservee au Super Admin.
router.post(
  '/categories/:categoryId/services',
  requireAdminRole(),
  associatedServiceValidators,
  categoryController.createAssociatedService
);
router.patch(
  '/services/:id',
  requireAdminRole(),
  updateAssociatedServiceValidators,
  categoryController.updateAssociatedService
);
router.delete('/services/:id', requireAdminRole(), categoryController.deleteAssociatedService);

// --- Gestion des villes / regions -------------------------------------------

router.get('/cities', cityController.getCitiesAdmin);

const cityValidators = [
  body('name').trim().notEmpty().isLength({ max: 100 }).withMessage('Nom requis.'),
  body('sortOrder').optional().isInt().toInt(),
];

const updateCityValidators = [
  body('name').optional().trim().notEmpty().isLength({ max: 100 }),
  body('sortOrder').optional().isInt().toInt(),
  body('isActive').optional().isBoolean().toBoolean(),
];

// Structure de la plateforme : reservee au Super Admin.
router.post('/cities', requireAdminRole(), cityValidators, cityController.createCity);
router.patch('/cities/:id', requireAdminRole(), updateCityValidators, cityController.updateCity);
router.delete('/cities/:id', requireAdminRole(), cityController.deleteCity);

// --- Factures d'abonnement (facturation admin -> prestataire) ---------------

router.get('/subscription-invoices', subscriptionInvoiceController.getSubscriptionInvoices);

const createSubscriptionInvoiceValidators = [
  body('amount').isFloat({ min: 0 }).withMessage('Montant invalide.').toFloat(),
  body('status').optional().isIn(['unpaid', 'paid', 'cancelled']).withMessage('Statut invalide.'),
  body('issuedAt').optional({ checkFalsy: true }).isISO8601().withMessage('Date d\'émission invalide.'),
  body('dueDate').optional({ checkFalsy: true }).isISO8601().withMessage('Date d\'échéance invalide.'),
];

const updateSubscriptionInvoiceValidators = [
  body('amount').optional().isFloat({ min: 0 }).withMessage('Montant invalide.').toFloat(),
  body('status').optional().isIn(['unpaid', 'paid', 'cancelled']).withMessage('Statut invalide.'),
  body('issuedAt').optional({ checkFalsy: true }).isISO8601().withMessage('Date d\'émission invalide.'),
  body('dueDate').optional({ checkFalsy: true }).isISO8601().withMessage('Date d\'échéance invalide.'),
];

// Facturation : reservee au Super Admin (action financiere).
router.post(
  '/providers/:id/subscription-invoices',
  requireAdminRole(),
  createSubscriptionInvoiceValidators,
  subscriptionInvoiceController.createSubscriptionInvoice
);
router.patch(
  '/subscription-invoices/:id',
  requireAdminRole(),
  updateSubscriptionInvoiceValidators,
  subscriptionInvoiceController.updateSubscriptionInvoice
);
router.delete(
  '/subscription-invoices/:id',
  requireAdminRole(),
  subscriptionInvoiceController.deleteSubscriptionInvoice
);
router.post(
  '/subscription-invoices/:id/send',
  requireAdminRole(),
  subscriptionInvoiceController.sendSubscriptionInvoice
);

// --- Plans & Tarifs (Parametres admin) --------------------------------------

router.get('/plans', adminController.getPlans);

const updatePlanValidators = [
  body('label').optional().trim().notEmpty().isLength({ max: 60 }),
  body('description').optional({ checkFalsy: true }).isLength({ max: 2000 }),
  body('price').optional().isFloat({ min: 0 }).withMessage('Prix invalide.').toFloat(),
  body('maxPhotos').optional().isInt({ min: 0 }).withMessage('Nombre de photos invalide.').toInt(),
  body('maxPromotions')
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .withMessage('Nombre de promotions invalide.')
    .toInt(),
  body('featured').optional().isBoolean().toBoolean(),
];

// Tarification : action financiere, reservee au Super Admin.
router.patch('/plans/:key', requireAdminRole(), updatePlanValidators, adminController.updatePlan);

// --- Email SMTP de la plateforme (Parametres admin) -------------------------

const updatePlatformEmailValidators = [
  body('provider').optional({ nullable: true }).isIn(['smtp', 'resend']).withMessage('Fournisseur email invalide.'),
  body('host').optional({ checkFalsy: true }).isLength({ max: 160 }),
  body('port').optional({ checkFalsy: true }).isLength({ max: 10 }),
  body('user').optional({ checkFalsy: true }).isLength({ max: 160 }),
  body('fromEmail').optional({ checkFalsy: true }).isEmail().withMessage('Adresse d\'expédition invalide.'),
];

// Identifiants systeme sensibles : reserves au Super Admin.
router.get('/settings/email', requireAdminRole(), platformSettingsController.getEmailSettings);
router.patch(
  '/settings/email',
  requireAdminRole(),
  updatePlatformEmailValidators,
  platformSettingsController.updateEmailSettings
);
router.post('/settings/email/test', requireAdminRole(), platformSettingsController.sendTestEmail);

module.exports = router;
