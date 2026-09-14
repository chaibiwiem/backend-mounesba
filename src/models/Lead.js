module.exports = (sequelize, DataTypes) => {
  const Lead = sequelize.define(
    'Lead',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      listingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      userId: { type: DataTypes.BIGINT.UNSIGNED },
      firstName: { type: DataTypes.STRING(80), allowNull: false },
      lastName: { type: DataTypes.STRING(80), allowNull: false },
      email: { type: DataTypes.STRING(160), allowNull: false },
      phone: { type: DataTypes.STRING(20), allowNull: false },
      eventDate: { type: DataTypes.DATEONLY },
      dateFlexible: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      guests: { type: DataTypes.STRING(40) },
      message: { type: DataTypes.TEXT },
      status: {
        type: DataTypes.ENUM('new', 'answered', 'late', 'converted', 'lost'),
        allowNull: false,
        defaultValue: 'new',
      },
      answeredAt: { type: DataTypes.DATE },
      // Champs specifiques aux prestataires de categorie Transport (location
      // de voiture/bus) : renseignes uniquement dans ce cas, jamais pour les
      // autres categories (voir leadController.createLead).
      departureDatetime: { type: DataTypes.DATE },
      returnDatetime: { type: DataTypes.DATE },
      passengers: { type: DataTypes.INTEGER },
      vehicleId: { type: DataTypes.BIGINT.UNSIGNED },
      withDriver: { type: DataTypes.BOOLEAN },
      // Modele de decoration choisi par le client parmi ceux proposes par le
      // vehicule (VehicleDecoration) - NULL si aucun choisi/disponible.
      decorationId: { type: DataTypes.BIGINT.UNSIGNED },
      pickupLocation: { type: DataTypes.STRING(255) },
      // Demande d'interet issue du formulaire dedie "Je suis interesse(e)"
      // sur un evenement prestataire (M5, "Mes evenements") - independant de
      // la categorie Transport, NULL pour toute demande de devis classique.
      providerEventId: { type: DataTypes.BIGINT.UNSIGNED },
      // Champs specifiques aux prestataires de categorie "Parfums & Soins"
      // (produits commandes en volume : coffrets invites, musc, bakhour,
      // soins) - renseignes uniquement dans ce cas, jamais pour les autres
      // categories (voir leadController.createLead). Reste une demande de
      // devis (lead) : ni panier, ni paiement, ni gestion de stock.
      quantity: { type: DataTypes.INTEGER },
      deliveryDate: { type: DataTypes.DATEONLY },
      deliveryMode: { type: DataTypes.ENUM('retrait', 'livraison') },
      deliveryAddress: { type: DataTypes.STRING(255) },
      // Produit precis vise dans le catalogue du prestataire (packages),
      // NULL si le client n'a pas de produit precis en tete ("Autre / a definir").
      packageId: { type: DataTypes.BIGINT.UNSIGNED },
      customization: { type: DataTypes.TEXT },
    },
    {
      tableName: 'leads',
      updatedAt: false,
    }
  );

  Lead.associate = (models) => {
    Lead.belongsTo(models.Listing, { foreignKey: 'listingId', as: 'listing' });
    Lead.belongsTo(models.User, { foreignKey: 'userId', as: 'client' });
    Lead.belongsTo(models.Vehicle, { foreignKey: 'vehicleId', as: 'vehicle' });
    Lead.belongsTo(models.VehicleDecoration, { foreignKey: 'decorationId', as: 'decoration' });
    Lead.belongsTo(models.ProviderEvent, { foreignKey: 'providerEventId', as: 'interestedEvent' });
    Lead.belongsTo(models.Package, { foreignKey: 'packageId', as: 'package' });
    Lead.hasMany(models.LeadOption, { foreignKey: 'leadId', as: 'selectedOptions' });
    Lead.hasMany(models.Booking, { foreignKey: 'leadId', as: 'bookings' });
  };

  return Lead;
};
