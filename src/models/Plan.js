// Catalogue des plans d'abonnement (Starter/Pro/Premium, CLAUDE.md/MODULES.md
// M9) - persiste en base pour permettre a l'admin (Parametres > Plans &
// Tarifs) de modifier prix/description/limites sans deploiement. La source
// de verite synchrone utilisee partout ailleurs (pdfService, subscription
// controllers...) reste PLAN_CATALOG (planService.js), charge depuis cette
// table au demarrage et mis a jour a chaque modification admin.
module.exports = (sequelize, DataTypes) => {
  const Plan = sequelize.define(
    'Plan',
    {
      key: { type: DataTypes.STRING(20), primaryKey: true },
      label: { type: DataTypes.STRING(60), allowNull: false },
      description: { type: DataTypes.TEXT },
      price: { type: DataTypes.DECIMAL(8, 2), allowNull: false, defaultValue: 0 },
      maxPhotos: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 5 },
      // NULL = illimite (ex. Premium), voir planService.updatePlanCatalogEntry.
      maxPromotions: { type: DataTypes.INTEGER, allowNull: true },
      featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: 'plans',
    }
  );

  return Plan;
};
