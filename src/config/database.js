const { Sequelize } = require('sequelize');
const mysql2 = require('mysql2');

require('dotenv').config();

const sequelizeOptions = {
  dialect: 'mysql',
  dialectModule: mysql2,
  logging: false,
  // Le plan Dev de Clever Cloud limite fortement les connexions simultanees, et
  // chaque instance serverless Vercel ouvre son propre pool : 1 connexion max par
  // instance, liberee vite quand elle est inactive.
  pool: { max: 1, min: 0, idle: 5000, acquire: 30000, evict: 1000 },
  define: {
    underscored: true,
    timestamps: true,
  },
};

// Accepte soit une DATABASE_URL unique, soit des variables DB_HOST/DB_PORT/
// DB_USER/DB_PASS/DB_NAME separees (les deux styles cohabitent selon les .env).
const sequelize = process.env.DATABASE_URL
  ? new Sequelize(process.env.DATABASE_URL, sequelizeOptions)
  : new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
      ...sequelizeOptions,
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
    });

module.exports = sequelize;
