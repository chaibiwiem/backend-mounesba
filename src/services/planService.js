const db = require('../models');

const { Subscription } = db;

// Catalogue des plans (CLAUDE.md, MODULES.md M9) : aucun paiement en ligne,
// l'activation/facturation est geree manuellement par l'admin hors plateforme.
// Valeurs par defaut ci-dessous, ecrasees au demarrage par loadPlansFromDb()
// (table `plans`, modifiable depuis Parametres admin > Plans & Tarifs) - ce
// const reste la source de verite SYNCHRONE utilisee par pdfService,
// subscriptionController, etc., qui ne peuvent pas toutes attendre une
// requete DB a chaque lecture.
const PLAN_CATALOG = {
  starter: {
    label: 'Starter',
    description: 'Fiche visible avec les fonctionnalites essentielles - ideal pour demarrer.',
    price: 0,
    maxPhotos: 5,
    maxPromotions: 1,
    featured: false,
  },
  pro: {
    label: 'Pro',
    description: 'Plus de photos et de promotions pour developper votre visibilite.',
    price: 59,
    maxPhotos: 20,
    maxPromotions: 5,
    featured: false,
  },
  premium: {
    label: 'Premium',
    description: 'Mise en avant prioritaire et promotions illimitees.',
    price: 119,
    maxPhotos: 20,
    maxPromotions: Infinity,
    featured: true,
  },
};

const VALID_PLANS = Object.keys(PLAN_CATALOG);

// Reflete une ligne `plans` (base) dans le catalogue en memoire - appele au
// demarrage (loadPlansFromDb) et immediatement apres chaque modification
// admin (adminController.updatePlan), pour eviter tout redemarrage serveur.
function updatePlanCatalogEntry(key, row) {
  PLAN_CATALOG[key] = {
    label: row.label,
    description: row.description || '',
    price: Number(row.price),
    maxPhotos: row.maxPhotos,
    maxPromotions: row.maxPromotions === null ? Infinity : row.maxPromotions,
    featured: Boolean(row.featured),
  };
}

async function loadPlansFromDb() {
  const { Plan } = db;
  const rows = await Plan.findAll();
  rows.forEach((row) => updatePlanCatalogEntry(row.key, row));
}

// Un prestataire sans ligne subscriptions (compte cree avant ce module, ou
// jamais synchronise) est traite comme Starter par defaut.
async function getProviderPlan(userId) {
  const subscription = await Subscription.findOne({ where: { userId } });
  const planKey = subscription?.plan || 'starter';
  return { planKey, limits: PLAN_CATALOG[planKey], subscription };
}

function addInterval(date, billingCycle) {
  const next = new Date(date);
  if (billingCycle === 'yearly') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  return next.toISOString().slice(0, 10);
}

module.exports = {
  PLAN_CATALOG,
  VALID_PLANS,
  getProviderPlan,
  addInterval,
  updatePlanCatalogEntry,
  loadPlansFromDb,
};
