const db = require('../models');

const { Category } = db;

const ACCOMMODATION_CATEGORY_SLUG = 'maisons-hotes';

// Prestataires "Maisons d'hôtes" (sous-categorie de Lieux de mariage) :
// proposent des chambres sur une periode (arrivee/depart), pas une prestation
// datee a l'unite - le formulaire de demande de devis leur propose donc
// arrivee/depart/chambres au lieu de date d'evenement/nombre d'invites (voir
// leadController.createLead). Meme logique que isTransportListing
// (transportService.js) : verifie via la categorie de la fiche, categorie
// principale ou l'une de ses sous-categories.
async function isAccommodationListing(listing) {
  const category = await Category.findByPk(listing.categoryId);
  if (!category) return false;
  if (category.slug === ACCOMMODATION_CATEGORY_SLUG) return true;
  if (category.parentId) {
    const parent = await Category.findByPk(category.parentId);
    return parent?.slug === ACCOMMODATION_CATEGORY_SLUG;
  }
  return false;
}

module.exports = { isAccommodationListing, ACCOMMODATION_CATEGORY_SLUG };
