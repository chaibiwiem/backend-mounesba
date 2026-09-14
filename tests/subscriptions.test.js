process.env.DATABASE_URL = '';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '3306';
process.env.DB_USER = process.env.DB_USER || 'root';
process.env.DB_PASS = process.env.DB_PASS || '';
process.env.DB_NAME = 'farahbooking_test';
process.env.JWT_SECRET = 'test_jwt_secret';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.SMTP_HOST = '127.0.0.1';
process.env.SMTP_PORT = '1';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/models');
const app = require('../src/app');
const subscriptionCronService = require('../src/services/subscriptionCronService');

const { User, Category, Listing, Subscription, SubscriptionInvoice } = db;

let providerUser;
let clientUser;
let category;

function tokenFor(user) {
  return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

beforeAll(async () => {
  await db.sequelize.sync({ force: true });

  category = await Category.create({ name: 'DJ', slug: 'dj-subscriptions-test' });

  providerUser = await User.create({
    role: 'provider',
    firstName: 'Karim',
    lastName: 'Mzoughi',
    email: 'provider.subscriptions.test@example.com',
    passwordHash: 'hash',
    emailVerified: true,
  });

  clientUser = await User.create({
    role: 'client',
    firstName: 'Amina',
    lastName: 'Client',
    email: 'client.subscriptions.test@example.com',
    passwordHash: 'hash',
    emailVerified: true,
  });

  await Listing.create({
    userId: providerUser.id,
    categoryId: category.id,
    title: 'DJ Karim Events',
    city: 'Tunis',
    status: 'active',
  });
});

afterAll(async () => {
  await db.sequelize.close();
});

describe('GET /api/subscriptions/me', () => {
  test('refuse un client (403)', async () => {
    const res = await request(app)
      .get('/api/subscriptions/me')
      .set('Authorization', `Bearer ${tokenFor(clientUser)}`);
    expect(res.status).toBe(403);
  });

  test('cree automatiquement un abonnement Starter si aucun n\'existe', async () => {
    const res = await request(app)
      .get('/api/subscriptions/me')
      .set('Authorization', `Bearer ${tokenFor(providerUser)}`);

    expect(res.status).toBe(200);
    expect(res.body.plan).toBe('starter');
    expect(Number(res.body.price)).toBe(0);
    expect(res.body.endDate).toBeNull();
    expect(res.body.limits.maxPhotos).toBe(5);
    expect(res.body.plans.premium.featured).toBe(true);

    const rows = await Subscription.count({ where: { userId: providerUser.id } });
    expect(rows).toBe(1);
  });

  test('inclut l\'historique des factures d\'abonnement du prestataire', async () => {
    const subscription = await Subscription.findOne({ where: { userId: providerUser.id } });
    await SubscriptionInvoice.create({
      subscriptionId: subscription.id,
      number: 'FACTURE-2026-TEST',
      amount: 59,
      status: 'paid',
      issuedAt: '2026-06-10',
      dueDate: '2026-07-10',
    });

    const res = await request(app)
      .get('/api/subscriptions/me')
      .set('Authorization', `Bearer ${tokenFor(providerUser)}`);

    expect(res.status).toBe(200);
    expect(res.body.invoices).toHaveLength(1);
    expect(res.body.invoices[0].number).toBe('FACTURE-2026-TEST');
    expect(Number(res.body.invoices[0].amount)).toBe(59);
  });
});

describe('POST /api/subscriptions/change-plan', () => {
  test('n\'existe plus (self-service supprime, seul l\'admin change le plan)', async () => {
    const res = await request(app)
      .post('/api/subscriptions/change-plan')
      .set('Authorization', `Bearer ${tokenFor(providerUser)}`)
      .send({ plan: 'pro' });
    expect(res.status).toBe(404);
  });
});

describe('Rappel J-7 (subscriptionCronService)', () => {
  test('envoie un rappel uniquement aux abonnements actifs expirant dans 7 jours, une seule fois', async () => {
    const inSevenDays = new Date();
    inSevenDays.setDate(inSevenDays.getDate() + 7);
    const targetDate = inSevenDays.toISOString().slice(0, 10);

    const subscription = await Subscription.findOne({ where: { userId: providerUser.id } });
    subscription.plan = 'pro';
    subscription.status = 'active';
    subscription.endDate = targetDate;
    subscription.reminderSentAt = null;
    await subscription.save();

    const firstRun = await subscriptionCronService.sendExpiryReminders();
    expect(firstRun).toBe(1);

    const updated = await Subscription.findByPk(subscription.id);
    expect(updated.reminderSentAt).not.toBeNull();

    const secondRun = await subscriptionCronService.sendExpiryReminders();
    expect(secondRun).toBe(0);
  });
});
