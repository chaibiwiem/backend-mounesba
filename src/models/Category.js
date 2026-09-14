module.exports = (sequelize, DataTypes) => {
  const Category = sequelize.define(
    'Category',
    {
      id: {
        type: DataTypes.INTEGER.UNSIGNED,
        autoIncrement: true,
        primaryKey: true,
      },
      parentId: { type: DataTypes.INTEGER.UNSIGNED },
      name: { type: DataTypes.STRING(120), allowNull: false },
      slug: { type: DataTypes.STRING(140), allowNull: false, unique: true },
      icon: { type: DataTypes.STRING(80) },
      iconUrl: { type: DataTypes.STRING(255) },
      imageUrl: { type: DataTypes.STRING(255) },
      sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: 'categories',
      timestamps: false,
    }
  );

  Category.associate = (models) => {
    Category.belongsTo(models.Category, { foreignKey: 'parentId', as: 'parent' });
    Category.hasMany(models.Category, { foreignKey: 'parentId', as: 'children' });
    Category.hasMany(models.Listing, { foreignKey: 'categoryId', as: 'listings' });
    Category.hasMany(models.AssociatedService, { foreignKey: 'categoryId', as: 'associatedServices' });
  };

  return Category;
};
