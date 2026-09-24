const path = require('path');
const fs = require('fs');
const { Op } = require('sequelize');
const db = require('../models');
const { UPLOAD_DIR } = require('../middleware/upload');
const cloudinaryStorage = require('../services/cloudinaryStorage');
const { encrypt } = require('../utils/secretCipher');
const emailService = require('../services/emailService');

const {
  Listing,
  Category,
  Image,
  Video,
  Package,
  Promotion,
  Review,
  User,
  ReviewPhoto,
  Subscription,
  Favorite,
  Vehicle,
  Lead,
  AssociatedService,
} = db;

function activePromotionWhere() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    isActive: true,
    [Op.and]: [
      { [Op.or]: [{ startDate: null }, { startDate: { [Op.lte]: today } }] },
      { [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: today } }] },
    ],
  };
}

exports.searchListings = async (req, res, next) => {
  try {
    const {
      q,
      category,
      city,
      priceMin,
      priceMax,
      minRating,
      promo,
      minSeats,
      vehicleType,
      sort = 'relevance',
      page = 1,
      limit = 12,
    } = req.query;

    const where = { status: 'active' };

    if (q) {
      where[Op.or] = [
        { title: { [Op.like]: `%${q}%` } },
        { description: { [Op.like]: `%${q}%` } },
      ];
    }

    if (city) where.city = city;

    if (priceMin || priceMax) {
      where.priceFrom = {};
      if (priceMin) where.priceFrom[Op.gte] = Number(priceMin);
      if (priceMax) where.priceFrom[Op.lte] = Number(priceMax);
    }

    if (minRating) where.ratingAvg = { [Op.gte]: Number(minRating) };

    if (category) {
      // Accepte un slug unique ou plusieurs (checkboxes du panneau de
      // filtres : ?category=a&category=b), pour permettre de cocher
      // plusieurs sous-categories d'une meme famille a la fois.
      const slugs = Array.isArray(category) ? category : [category];
      const categoryRecords = await Category.findAll({ where: { slug: slugs } });
      if (categoryRecords.length === 0) {
        where.categoryId = -1;
      } else {
        const topLevel = categoryRecords.filter((c) => c.parentId === null);
        const subCategories = categoryRecords.filter((c) => c.parentId !== null);
        let categoryIds = subCategories.map((c) => c.id);
        if (topLevel.length > 0) {
          // Categorie principale : les prestataires s'inscrivent toujours sous
          // une sous-categorie precise (jamais la categorie principale elle-
          // meme), donc filtrer sur son seul id ne retournerait jamais rien.
          // On inclut aussi toutes ses sous-categories.
          const children = await Category.findAll({
            where: { parentId: topLevel.map((c) => c.id) },
            attributes: ['id'],
          });
          categoryIds = [...categoryIds, ...topLevel.map((c) => c.id), ...children.map((c) => c.id)];
        }
        where.categoryId = [...new Set(categoryIds)];
      }
    }

    const include = [
      { model: Category, as: 'category', attributes: ['id', 'name', 'slug'] },
      {
        model: Image,
        as: 'images',
        attributes: ['id', 'url', 'isPrimary'],
        required: false,
        separate: true,
        order: [['isPrimary', 'DESC'], ['sortOrder', 'ASC']],
        limit: 5,
      },
      {
        model: Promotion,
        as: 'promotions',
        attributes: ['id', 'type', 'value', 'label'],
        required: promo === 'true',
        where: activePromotionWhere(),
      },
      // Uniquement pour savoir si la fiche a au moins une video (bouton
      // lecture sur la carte de recherche) - pas besoin des donnees completes.
      {
        model: Video,
        as: 'videos',
        attributes: ['id'],
        required: false,
        separate: true,
        limit: 1,
      },
    ];

    // Filtres flotte (categorie Transport uniquement) : places minimum et/ou
    // type de vehicule. `required: true` restreint naturellement aux fiches
    // ayant au moins un vehicule actif correspondant, sans avoir a filtrer
    // explicitement par categorie (une fiche hors Transport n'a jamais de
    // vehicule, donc ne matcherait de toute facon jamais ce join).
    if (minSeats || vehicleType) {
      const vehicleWhere = { isAvailable: true };
      if (minSeats) vehicleWhere.seats = { [Op.gte]: Number(minSeats) };
      if (vehicleType) vehicleWhere.type = vehicleType;

      include.push({
        model: Vehicle,
        as: 'vehicles',
        attributes: [],
        required: true,
        where: vehicleWhere,
      });
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 12, 1), 50);
    const offset = (pageNum - 1) * limitNum;

    let rows;
    let count;

    if (sort === 'price_asc' || sort === 'price_desc' || sort === 'rating' || sort === 'popularity') {
      const order = {
        price_asc: [['priceFrom', 'ASC']],
        price_desc: [['priceFrom', 'DESC']],
        rating: [['ratingAvg', 'DESC']],
        popularity: [['viewsCount', 'DESC']],
      }[sort];

      ({ rows, count } = await Listing.findAndCountAll({
        where,
        include,
        order,
        limit: limitNum,
        offset,
        distinct: true,
        // Documents legaux sensibles (CLAUDE.md, section Securite) : jamais
        // exposes sur une reponse publique.
        attributes: { exclude: ['taxId', 'cinDocumentUrl'] },
      }));
    } else {
      // Tri par defaut : mise en avant Premium (MODULES.md M9). La pagination
      // combinee a l'include hasMany `promotions` force Sequelize a envelopper
      // la requete dans une sous-requete ; un CASE brut injecte dans `order`
      // y est reevalue tel quel dans la partie externe, ou la table derivee
      // n'expose plus les colonnes d'origine mais leurs alias camelCase, ce
      // qui casse la requete ("Unknown column") des qu'un abonne Premium
      // existe. On evite ce piege en triant/paginant cote JS : le volume de
      // fiches actives reste modeste pour cette plateforme.
      const premiumProviders = await Subscription.findAll({
        where: { plan: 'premium', status: 'active' },
        attributes: ['userId'],
      });
      const premiumUserIds = new Set(premiumProviders.map((p) => Number(p.userId)));

      const allRows = await Listing.findAll({
        where,
        include,
        order: [['ratingAvg', 'DESC'], ['viewsCount', 'DESC']],
        attributes: { exclude: ['taxId', 'cinDocumentUrl'] },
      });

      const premiumRows = [];
      const otherRows = [];
      for (const row of allRows) {
        (premiumUserIds.has(Number(row.userId)) ? premiumRows : otherRows).push(row);
      }
      const sorted = [...premiumRows, ...otherRows];

      count = sorted.length;
      rows = sorted.slice(offset, offset + limitNum);
    }

    let favoritedIds = new Set();
    if (req.user?.role === 'client') {
      const favorites = await Favorite.findAll({
        where: { userId: req.user.id, listingId: rows.map((r) => r.id) },
        attributes: ['listingId'],
      });
      favoritedIds = new Set(favorites.map((f) => Number(f.listingId)));
    }

    const results = rows.map((row) => {
      const json = row.toJSON();
      const hasVideo = (json.videos?.length || 0) > 0;
      delete json.videos;
      return { ...json, hasVideo, isFavorited: favoritedIds.has(row.id) };
    });

    return res.json({
      results,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum) || 1,
      },
    });
  } catch (err) {
    return next(err);
  }
};

// Partagee par la recherche par id (legacy /:id) et par slug (URL publique
// SEO /:categorySlug/:listingSlug) : meme reponse, seule la clause `where`
// de resolution de la fiche change.
async function respondWithListingDetail(where, req, res, next) {
  try {
    const listing = await Listing.findOne({
      where: { ...where, status: 'active' },
      include: [
        {
          model: Category,
          as: 'category',
          include: [
            { model: AssociatedService, as: 'associatedServices' },
            // Le listing est toujours rattache a une sous-categorie
            // (CLAUDE.md), les services associes vivent sur la categorie
            // principale (parent) - voir AssociatedService.
            {
              model: Category,
              as: 'parent',
              include: [{ model: AssociatedService, as: 'associatedServices' }],
            },
          ],
        },
        { model: User, as: 'owner', attributes: ['id', 'firstName', 'lastName'] },
        { model: Image, as: 'images' },
        { model: Video, as: 'videos' },
        { model: Package, as: 'packages' },
        {
          model: Promotion,
          as: 'promotions',
          required: false,
          where: activePromotionWhere(),
        },
        {
          model: Review,
          as: 'reviews',
          required: false,
          where: { isReported: false },
          include: [
            { model: User, as: 'author', attributes: ['id', 'firstName'], required: false },
            { model: ReviewPhoto, as: 'photos' },
          ],
        },
      ],
      order: [[{ model: Image, as: 'images' }, 'sortOrder', 'ASC']],
      attributes: { exclude: ['taxId', 'cinDocumentUrl'] },
    });

    if (!listing) {
      return res.status(404).json({ message: 'Prestataire introuvable.' });
    }

    await listing.increment('viewsCount');

    const ratingBreakdown = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: listing.reviews.filter((r) => r.rating === star).length,
    }));

    let isFavorited = false;
    if (req.user?.role === 'client') {
      const favorite = await Favorite.findOne({ where: { userId: req.user.id, listingId: listing.id } });
      isFavorited = Boolean(favorite);
    }

    // Badge "Réponse en 24h" (carte coordonnées, M4/CLAUDE.md) : meme calcul
    // que leadController.getListingLeads (taux de reponse sous 24h < 50% ->
    // badge retire), mais public - pas de details individuels des leads ici.
    const providerLeads = await Lead.findAll({
      where: { listingId: listing.id },
      attributes: ['createdAt', 'answeredAt'],
    });
    const totalLeads = providerLeads.length;
    const answeredWithin24h = providerLeads.filter((lead) => {
      if (!lead.answeredAt) return false;
      return lead.answeredAt.getTime() - lead.createdAt.getTime() <= 24 * 60 * 60 * 1000;
    }).length;
    const responseRate = totalLeads > 0 ? Math.round((answeredWithin24h / totalLeads) * 100) : null;
    const fastResponseBadge = responseRate === null ? true : responseRate >= 50;

    return res.json({ ...listing.toJSON(), ratingBreakdown, isFavorited, fastResponseBadge });
  } catch (err) {
    return next(err);
  }
}

exports.getListingDetail = (req, res, next) =>
  respondWithListingDetail({ id: req.params.id }, req, res, next);

// URL publique SEO /:categorySlug/:listingSlug (MODULES.md M3) : seul le
// slug de la fiche identifie la ressource, categorySlug n'est utilise que
// pour la lisibilite de l'URL (pas de validation croisee stricte, pour ne
// pas 404 une fiche valide si sa categorie a ete renommee entre-temps).
exports.getListingDetailBySlug = (req, res, next) =>
  respondWithListingDetail({ slug: req.params.listingSlug }, req, res, next);

const EDITABLE_LISTING_FIELDS = [
  'title',
  'description',
  'priceFrom',
  'priceTo',
  'capacityMin',
  'capacity',
  'city',
  'address',
  'googleMapsUrl',
  'phone',
  'website',
  'facebookUrl',
  'instagramUrl',
  'tiktokUrl',
  'linkedinUrl',
  'whatsappUrl',
  'amenities',
  'yearsExperience',
  'languages',
];

exports.getMyListing = async (req, res, next) => {
  try {
    const listing = await Listing.findOne({
      where: { userId: req.user.id },
      include: [
        { model: Category, as: 'category' },
        { model: Image, as: 'images' },
        { model: Video, as: 'videos' },
        { model: Package, as: 'packages' },
        { model: Promotion, as: 'promotions' },
        {
          model: Review,
          as: 'reviews',
          include: [
            { model: User, as: 'author', attributes: ['id', 'firstName'], required: false },
            { model: ReviewPhoto, as: 'photos' },
          ],
        },
      ],
      order: [[{ model: Image, as: 'images' }, 'sortOrder', 'ASC']],
    });

    if (!listing) {
      return res.status(404).json({ message: 'Aucune fiche prestataire associée à votre compte.' });
    }

    return res.json(listing);
  } catch (err) {
    return next(err);
  }
};

// Le prestataire ne modifie QUE sa propre fiche (CLAUDE.md - Contrôle d'accès).
// categoryId et status restent hors de portée : la catégorie est fixée à
// l'inscription, le statut est contrôlé par l'admin (Phase 8).
exports.updateMyListing = async (req, res, next) => {
  try {
    const listing = await Listing.findOne({ where: { userId: req.user.id } });
    if (!listing) {
      return res.status(404).json({ message: 'Aucune fiche prestataire associée à votre compte.' });
    }

    EDITABLE_LISTING_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) listing[field] = req.body[field];
    });

    await listing.save();
    return res.json(listing);
  } catch (err) {
    return next(err);
  }
};

// Supprime l'ancien fichier logo stocke sur disque, le cas echeant (jamais
// pour un logo deja externe/absent).
function removeLogoFile(logoUrl) {
  if (!logoUrl) return;
  if (/^https?:\/\//i.test(logoUrl)) {
    cloudinaryStorage.destroy(logoUrl);
    return;
  }
  if (!logoUrl.startsWith('/uploads/listings/')) return;
  const filePath = path.join(UPLOAD_DIR, path.basename(logoUrl));
  fs.unlink(filePath, () => {});
}

// Logo prestataire (module M5) : image distincte de la galerie photos,
// affichee dans l'espace prestataire. Meme pipeline de verification que les
// photos de galerie (magic bytes JPG/PNG, 5 Mo max - CLAUDE.md Uploads).
exports.uploadLogo = async (req, res, next) => {
  try {
    const listing = await Listing.findOne({ where: { userId: req.user.id } });
    if (!listing) {
      return res.status(404).json({ message: 'Aucune fiche prestataire associée à votre compte.' });
    }

    const previousLogoUrl = listing.logoUrl;
    listing.logoUrl = req.uploadedFile.url;
    await listing.save();
    removeLogoFile(previousLogoUrl);

    return res.json(listing);
  } catch (err) {
    return next(err);
  }
};

exports.deleteLogo = async (req, res, next) => {
  try {
    const listing = await Listing.findOne({ where: { userId: req.user.id } });
    if (!listing) {
      return res.status(404).json({ message: 'Aucune fiche prestataire associée à votre compte.' });
    }

    removeLogoFile(listing.logoUrl);
    listing.logoUrl = null;
    await listing.save();

    return res.json(listing);
  } catch (err) {
    return next(err);
  }
};

const VALID_EMAIL_PROVIDERS = ['smtp', 'resend'];

// Config email du prestataire (onglet "Email SMTP" du dashboard, M5) : les
// emails envoyes a SES clients (factures/contrats) partent alors de sa
// propre identite plutot que du SMTP central de la plateforme - voir
// services/emailService.js. Le secret (mot de passe SMTP / cle API Resend)
// n'est JAMAIS renvoye au frontend, ni en clair ni chiffre - seul un
// booleen indique s'il est deja enregistre (CLAUDE.md - secrets jamais
// exposes).
exports.getMyEmailSettings = async (req, res, next) => {
  try {
    const listing = await Listing.findOne({ where: { userId: req.user.id } });
    if (!listing) {
      return res.status(404).json({ message: 'Aucune fiche prestataire associée à votre compte.' });
    }

    const settings = listing.emailSettings || {};
    return res.json({
      provider: settings.provider || null,
      host: settings.host || '',
      port: settings.port || '',
      user: settings.user || '',
      fromEmail: settings.fromEmail || '',
      hasPassword: Boolean(settings.passEncrypted),
      hasApiKey: Boolean(settings.apiKeyEncrypted),
    });
  } catch (err) {
    return next(err);
  }
};

exports.updateMyEmailSettings = async (req, res, next) => {
  try {
    const listing = await Listing.findOne({ where: { userId: req.user.id } });
    if (!listing) {
      return res.status(404).json({ message: 'Aucune fiche prestataire associée à votre compte.' });
    }

    const { provider, host, port, user, fromEmail, pass, apiKey } = req.body;

    if (provider !== undefined && provider !== null && !VALID_EMAIL_PROVIDERS.includes(provider)) {
      return res.status(400).json({ message: 'Fournisseur email invalide.' });
    }

    const previous = listing.emailSettings || {};
    const next_ = {
      provider: provider !== undefined ? provider : previous.provider || null,
      host: host !== undefined ? host : previous.host || '',
      port: port !== undefined ? port : previous.port || '',
      user: user !== undefined ? user : previous.user || '',
      fromEmail: fromEmail !== undefined ? fromEmail : previous.fromEmail || '',
      // pass/apiKey non fournis = on conserve le secret deja enregistre ;
      // chaine vide explicite = suppression volontaire.
      passEncrypted: pass !== undefined ? (pass ? encrypt(pass) : null) : previous.passEncrypted || null,
      apiKeyEncrypted: apiKey !== undefined ? (apiKey ? encrypt(apiKey) : null) : previous.apiKeyEncrypted || null,
    };

    listing.emailSettings = next_;
    await listing.save();

    return res.json({
      provider: next_.provider,
      host: next_.host,
      port: next_.port,
      user: next_.user,
      fromEmail: next_.fromEmail,
      hasPassword: Boolean(next_.passEncrypted),
      hasApiKey: Boolean(next_.apiKeyEncrypted),
    });
  } catch (err) {
    return next(err);
  }
};

exports.sendMyTestEmail = async (req, res, next) => {
  try {
    const listing = await Listing.findOne({ where: { userId: req.user.id } });
    if (!listing) {
      return res.status(404).json({ message: 'Aucune fiche prestataire associée à votre compte.' });
    }

    const to = req.body.to || req.user.email;
    if (!to) {
      return res.status(400).json({ message: 'Adresse email de destination requise.' });
    }

    await emailService.sendTestEmail(listing, to);
    return res.json({ message: `Email de test envoyé à ${to}.` });
  } catch (err) {
    return res.status(422).json({
      message: `Échec de l'envoi : ${err.message || 'vérifiez votre configuration.'}`,
    });
  }
};

exports.getSimilarListings = async (req, res, next) => {
  try {
    const { id } = req.params;
    const listing = await Listing.findByPk(id);

    if (!listing) {
      return res.status(404).json({ message: 'Prestataire introuvable.' });
    }

    const similar = await Listing.findAll({
      where: {
        id: { [Op.ne]: listing.id },
        categoryId: listing.categoryId,
        city: listing.city,
        status: 'active',
      },
      include: [
        {
          model: Image,
          as: 'images',
          required: false,
          separate: true,
          where: { isPrimary: true },
          limit: 1,
        },
      ],
      limit: 4,
      order: [['ratingAvg', 'DESC']],
    });

    return res.json(similar);
  } catch (err) {
    return next(err);
  }
};
