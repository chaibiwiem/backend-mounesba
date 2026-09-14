const db = require('../models');
const { PLAN_CATALOG } = require('../services/planService');

const { Subscription, SubscriptionInvoice } = db;

function toPublicSubscription(subscription) {
  return {
    id: subscription.id,
    plan: subscription.plan,
    price: subscription.price,
    billingCycle: subscription.billingCycle,
    status: subscription.status,
    startDate: subscription.startDate,
    endDate: subscription.endDate,
    limits: PLAN_CATALOG[subscription.plan],
    plans: PLAN_CATALOG,
    invoices: (subscription.invoices || []).map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      amount: invoice.amount,
      status: invoice.status,
      issuedAt: invoice.issuedAt,
      dueDate: invoice.dueDate,
      pdfUrl: invoice.pdfUrl,
    })),
  };
}

// Cree une ligne Starter par defaut si le prestataire n'en a pas encore (ex.
// compte cree avant ce module) — meme logique d'auto-guerison que GET /auth/me.
async function findOrCreateSubscription(userId) {
  const [subscription] = await Subscription.findOrCreate({
    where: { userId },
    defaults: {
      userId,
      plan: 'starter',
      price: PLAN_CATALOG.starter.price,
      billingCycle: 'monthly',
      status: 'active',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: null,
    },
  });
  return subscription;
}

// Lecture seule (US-P10) : le prestataire consulte son plan/echeance/factures,
// mais ne peut pas changer de plan lui-meme. Le changement de plan est
// reserve a l'admin (PATCH /api/admin/providers/:id/subscription), coherent
// avec "aucun paiement en ligne, activation/facturation geree par l'admin"
// (CLAUDE.md).
exports.getMySubscription = async (req, res, next) => {
  try {
    const subscription = await findOrCreateSubscription(req.user.id);
    const invoices = await SubscriptionInvoice.findAll({
      where: { subscriptionId: subscription.id },
      order: [['issuedAt', 'DESC']],
    });
    subscription.invoices = invoices;

    return res.json(toPublicSubscription(subscription));
  } catch (err) {
    return next(err);
  }
};
