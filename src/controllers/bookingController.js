const { validationResult } = require('express-validator');
const db = require('../models');
const crmService = require('../services/crmService');

const { Booking, Listing, Review, Image, Category, Client, Lead } = db;

const BOOKING_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'];
const PAYMENT_METHODS = ['cash', 'rib'];
const EDITABLE_BOOKING_FIELDS = [
  'eventDate',
  'startTime',
  'endTime',
  'totalPrice',
  'deposit',
  'paymentMethod',
  'notes',
  'status',
];

async function getOwnListing(req, res) {
  const listing = await Listing.findOne({ where: { userId: req.user.id } });
  if (!listing) {
    res.status(404).json({ message: 'Aucune fiche prestataire associée à votre compte.' });
    return null;
  }
  return listing;
}

// Nécessaire au client pour savoir quelle réservation il peut noter
// (US-C10) : uniquement ses propres réservations, avec l'avis déjà publié
// le cas échéant (pour ne pas proposer un second avis sur le même booking).
// image/adresse/categorie inclus pour le récapitulatif du module d'avis.
exports.getMyBookings = async (req, res, next) => {
  try {
    const bookings = await Booking.findAll({
      where: { userId: req.user.id },
      include: [
        {
          model: Listing,
          as: 'listing',
          attributes: ['id', 'title', 'city', 'address'],
          include: [
            { model: Category, as: 'category', attributes: ['name'] },
            {
              model: Image,
              as: 'images',
              attributes: ['url', 'isPrimary'],
              separate: true,
              order: [['isPrimary', 'DESC'], ['sortOrder', 'ASC']],
              limit: 1,
            },
          ],
        },
        { model: Review, as: 'review' },
      ],
      order: [['eventDate', 'DESC']],
    });

    return res.json(bookings);
  } catch (err) {
    return next(err);
  }
};

// Liste des réservations d'une fiche, côté prestataire (module M5) : accord
// conclus en direct, avec ou sans lead d'origine.
exports.getListingBookings = async (req, res, next) => {
  try {
    const { id } = req.params;
    const listing = await Listing.findByPk(id);
    if (!listing) {
      return res.status(404).json({ message: 'Prestataire introuvable.' });
    }
    if (listing.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Accès interdit.' });
    }

    const bookings = await Booking.findAll({
      where: { listingId: id },
      include: [
        { model: Client, as: 'client' },
        { model: Lead, as: 'lead', attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] },
        { model: Review, as: 'review', attributes: ['id'] },
      ],
      order: [['eventDate', 'DESC'], ['createdAt', 'DESC']],
    });

    return res.json(bookings);
  } catch (err) {
    return next(err);
  }
};

// Enregistrement manuel d'un accord conclu en direct (CLAUDE.md - aucun
// paiement en ligne, montants déclaratifs) : soit à partir d'un lead
// converti, soit création directe pour un client trouvé hors plateforme.
exports.createBooking = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const listing = await getOwnListing(req, res);
    if (!listing) return;

    const {
      leadId,
      clientId,
      clientName,
      clientEmail,
      clientPhone,
      eventDate,
      startTime,
      endTime,
      totalPrice,
      deposit,
      paymentMethod,
      status,
      notes,
    } = req.body;

    const finalStatus = status || 'confirmed';
    if (!BOOKING_STATUSES.includes(finalStatus)) {
      return res.status(400).json({ message: 'Statut invalide.' });
    }
    if (paymentMethod && !PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ message: 'Mode de règlement invalide.' });
    }

    let lead = null;
    if (leadId) {
      lead = await Lead.findOne({ where: { id: leadId, listingId: listing.id } });
      if (!lead) {
        return res.status(404).json({ message: 'Demande introuvable.' });
      }
      const existingBooking = await Booking.findOne({ where: { leadId: lead.id } });
      if (existingBooking) {
        return res.status(409).json({
          message: 'Une réservation existe déjà pour cette demande. Modifiez-la plutôt.',
        });
      }
    }

    // Client CRM cible : existant (clientId - peut déjà être lié à un compte
    // plateforme via userId, hérité d'un lead soumis connecté), nouveau (nom
    // + coordonnées optionnelles, "client trouvé hors plateforme"), ou
    // dérivé du lead si rien n'est fourni explicitement (fiche déjà
    // auto-créée à la réception du lead - M4/M6). Le statut "client
    // plateforme" n'est jamais assigné manuellement ici : il ne provient que
    // d'une demande de devis soumise en étant connecté (lead.userId).
    let client = null;
    let platformUserId = null;
    if (clientId) {
      client = await Client.findOne({ where: { id: clientId, listingId: listing.id } });
      if (!client) {
        return res.status(404).json({ message: 'Client introuvable.' });
      }
      platformUserId = client.userId || null;
    } else if (clientName && clientName.trim()) {
      if (clientEmail) {
        [client] = await Client.findOrCreate({
          where: { listingId: listing.id, email: clientEmail },
          defaults: {
            listingId: listing.id,
            name: clientName.trim(),
            email: clientEmail,
            phone: clientPhone || null,
          },
        });
      } else {
        client = await Client.create({
          listingId: listing.id,
          name: clientName.trim(),
          phone: clientPhone || null,
        });
      }
    } else if (lead) {
      client = await crmService.findOrCreateClientForLead(lead, listing);
    } else {
      return res.status(400).json({
        message: 'Sélectionnez un client existant ou renseignez au moins son nom.',
      });
    }

    const booking = await Booking.create({
      leadId: lead ? lead.id : null,
      listingId: listing.id,
      clientId: client.id,
      userId: lead ? lead.userId : platformUserId,
      eventDate: eventDate || null,
      startTime: startTime || null,
      endTime: endTime || null,
      status: finalStatus,
      totalPrice: totalPrice || null,
      deposit: deposit || null,
      paymentMethod: paymentMethod || null,
      notes: notes || null,
    });

    // Recalcule events_count + tag CRM (CLAUDE.md - Nouveau/Récurrent/VIP),
    // sauf réservation déjà annulée dès sa création.
    if (finalStatus !== 'cancelled') {
      await crmService.registerConvertedEvent(client);
    }
    // Montant total + acompte déclarés (CRM) : recalculés à partir des
    // réservations non annulées du client, voir crmService.
    await crmService.recalculateClientFinancials(client);

    // Réservation issue d'un lead : le lead passe "converti" (US-P06), même
    // logique que PATCH /api/leads/:id/status (module M4).
    if (lead && lead.status !== 'converted') {
      if (!lead.answeredAt) lead.answeredAt = new Date();
      lead.status = 'converted';
      await lead.save();
    }

    const created = await Booking.findByPk(booking.id, {
      include: [
        { model: Client, as: 'client' },
        { model: Lead, as: 'lead', attributes: ['id', 'firstName', 'lastName', 'email', 'phone'] },
      ],
    });

    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
};

exports.updateBooking = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const booking = await Booking.findByPk(req.params.id, {
      include: [{ model: Listing, as: 'listing' }],
    });
    if (!booking) {
      return res.status(404).json({ message: 'Réservation introuvable.' });
    }
    if (booking.listing.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Accès interdit.' });
    }

    if (req.body.status !== undefined && !BOOKING_STATUSES.includes(req.body.status)) {
      return res.status(400).json({ message: 'Statut invalide.' });
    }
    if (
      req.body.paymentMethod !== undefined &&
      req.body.paymentMethod !== null &&
      !PAYMENT_METHODS.includes(req.body.paymentMethod)
    ) {
      return res.status(400).json({ message: 'Mode de règlement invalide.' });
    }

    EDITABLE_BOOKING_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) booking[field] = req.body[field];
    });

    await booking.save();

    // Montant total + acompte déclarés (CRM) : resynchronisés si le montant,
    // l'acompte ou le statut (annulation) de cette réservation a changé.
    const client = await Client.findByPk(booking.clientId);
    if (client) await crmService.recalculateClientFinancials(client);

    return res.json(booking);
  } catch (err) {
    return next(err);
  }
};

// Suppression definitive d'une reservation (calendrier M5, action
// "Supprimer" du panneau de detail) - distincte du statut "cancelled" (qui
// conserve la ligne, ex: litige/historique). Recalcule le compteur
// d'evenements du client concerne, contrairement a la creation (incremental
// uniquement, jamais decremente ailleurs).
exports.deleteBooking = async (req, res, next) => {
  try {
    const booking = await Booking.findByPk(req.params.id, {
      include: [
        { model: Listing, as: 'listing' },
        { model: Client, as: 'client' },
      ],
    });
    if (!booking) {
      return res.status(404).json({ message: 'Réservation introuvable.' });
    }
    if (booking.listing.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Accès interdit.' });
    }

    const { client } = booking;
    await booking.destroy();

    if (client) {
      await crmService.recalculateClientEventsCount(client);
      await crmService.recalculateClientFinancials(client);
    }

    return res.json({ message: 'Réservation supprimée.' });
  } catch (err) {
    return next(err);
  }
};

exports.updateBookingStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!BOOKING_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Statut invalide.' });
    }

    const booking = await Booking.findByPk(req.params.id, {
      include: [{ model: Listing, as: 'listing' }],
    });
    if (!booking) {
      return res.status(404).json({ message: 'Réservation introuvable.' });
    }
    if (booking.listing.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Accès interdit.' });
    }

    booking.status = status;
    await booking.save();

    // Montant total + acompte déclarés (CRM) : une annulation retire cette
    // réservation du cumul, voir crmService.
    const client = await Client.findByPk(booking.clientId);
    if (client) await crmService.recalculateClientFinancials(client);

    return res.json(booking);
  } catch (err) {
    return next(err);
  }
};
