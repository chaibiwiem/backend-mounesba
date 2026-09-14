module.exports = (sequelize, DataTypes) => {
  const Booking = sequelize.define(
    'Booking',
    {
      id: {
        type: DataTypes.BIGINT.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      leadId: { type: DataTypes.BIGINT.UNSIGNED },
      listingId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
      clientId: { type: DataTypes.BIGINT.UNSIGNED },
      userId: { type: DataTypes.BIGINT.UNSIGNED },
      eventDate: { type: DataTypes.DATEONLY },
      // Heure de debut/fin optionnelle de la prestation (calendrier M5, vues
      // Semaine/Jour) - eventDate seul suffisait pour la vue Mois existante,
      // mais un positionnement horaire reel necessite ces deux champs.
      startTime: { type: DataTypes.TIME },
      endTime: { type: DataTypes.TIME },
      status: {
        type: DataTypes.ENUM('pending', 'confirmed', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      totalPrice: { type: DataTypes.DECIMAL(12, 2) },
      deposit: { type: DataTypes.DECIMAL(12, 2) },
      paymentMethod: { type: DataTypes.ENUM('cash', 'rib') },
      notes: { type: DataTypes.TEXT },
    },
    {
      tableName: 'bookings',
    }
  );

  Booking.associate = (models) => {
    Booking.belongsTo(models.Lead, { foreignKey: 'leadId', as: 'lead' });
    Booking.belongsTo(models.Listing, { foreignKey: 'listingId', as: 'listing' });
    Booking.belongsTo(models.Client, { foreignKey: 'clientId', as: 'client' });
    Booking.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    Booking.hasOne(models.Review, { foreignKey: 'bookingId', as: 'review' });
  };

  return Booking;
};
