const nodemailer = require('nodemailer');
const { decrypt } = require('../utils/secretCipher');

const platformTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
});

// Configuration SMTP/Resend systeme, modifiable depuis Parametres admin >
// Email SMTP (platformSettingsController) - mise en cache pour ne pas
// requeter la base a chaque email envoye, invalidee explicitement a chaque
// sauvegarde admin (clearPlatformSettingsCache). Tant qu'aucune config n'est
// enregistree, `platformTransporter` (process.env.SMTP_*) reste utilise -
// comportement inchange, cf. sendMail.
let platformSettingsCache;
async function getPlatformSettings() {
  if (platformSettingsCache === undefined) {
    const db = require('../models');
    platformSettingsCache = await db.PlatformSetting.findOne();
  }
  return platformSettingsCache;
}

function clearPlatformSettingsCache() {
  platformSettingsCache = undefined;
}

// Envoie via l'API Resend (pas de dependance supplementaire : appel HTTP
// direct avec le fetch natif de Node 18+).
async function sendViaResend(apiKey, { from, to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend a répondu ${res.status} : ${body}`);
  }
}

// N'interrompt jamais le flux appelant (sauf sendTestEmail, qui a besoin de
// remonter l'erreur pour informer le prestataire) : un echec d'envoi est
// logge, pas leve, pour ne pas faire echouer une action deja enregistree
// en base (inscription, creation de facture...).
//
// `listing` optionnel : si fourni et que sa config email_settings (M5,
// "Email SMTP") est complete, l'email part depuis l'identite du prestataire
// (son propre SMTP ou Resend) plutot que du SMTP central de la plateforme -
// pertinent uniquement pour les emails prestataire -> client (facture,
// contrat). Sans configuration ou pour les emails plateforme -> utilisateur
// (verification, notifications...), comportement inchange.
async function sendMail(to, subject, html, { listing, throwOnError = false } = {}) {
  const settings = listing?.emailSettings;

  try {
    if (settings?.provider === 'resend' && settings.apiKeyEncrypted) {
      const apiKey = decrypt(settings.apiKeyEncrypted);
      await sendViaResend(apiKey, {
        from: settings.fromEmail || settings.user || 'contact@mounesba.tn',
        to,
        subject,
        html,
      });
      return;
    }

    if (settings?.provider === 'smtp' && settings.host && settings.user && settings.passEncrypted) {
      const providerTransporter = nodemailer.createTransport({
        host: settings.host,
        port: Number(settings.port) || 587,
        secure: Number(settings.port) === 465,
        auth: { user: settings.user, pass: decrypt(settings.passEncrypted) },
      });
      await providerTransporter.sendMail({
        from: settings.fromEmail || settings.user,
        to,
        subject,
        html,
      });
      return;
    }

    // Config plateforme (Parametres admin > Email SMTP) : utilisee pour tous
    // les emails systeme (verification, reset...) et par defaut pour les
    // emails prestataire sans configuration propre.
    const platformSettings = await getPlatformSettings();

    if (platformSettings?.emailProvider === 'resend' && platformSettings.emailApiKeyEncrypted) {
      const apiKey = decrypt(platformSettings.emailApiKeyEncrypted);
      await sendViaResend(apiKey, {
        from: platformSettings.emailFromEmail || 'contact@mounesba.tn',
        to,
        subject,
        html,
      });
      return;
    }

    if (
      platformSettings?.emailProvider === 'smtp' &&
      platformSettings.emailHost &&
      platformSettings.emailUser &&
      platformSettings.emailPassEncrypted
    ) {
      const platformDbTransporter = nodemailer.createTransport({
        host: platformSettings.emailHost,
        port: Number(platformSettings.emailPort) || 587,
        secure: Number(platformSettings.emailPort) === 465,
        auth: { user: platformSettings.emailUser, pass: decrypt(platformSettings.emailPassEncrypted) },
      });
      await platformDbTransporter.sendMail({
        from: platformSettings.emailFromEmail || platformSettings.emailUser,
        to,
        subject,
        html,
      });
      return;
    }

    await platformTransporter.sendMail({
      from: process.env.SMTP_USER || 'contact@mounesba.tn',
      to,
      subject,
      html,
    });
  } catch (err) {
    console.error(`Échec envoi email à ${to} :`, err.message);
    if (throwOnError) throw err;
  }
}

// Email de test envoye depuis l'onglet "Email SMTP" du dashboard prestataire,
// pour verifier une configuration avant de compter dessus pour les
// factures/contrats. Remonte l'erreur (throwOnError) : contrairement aux
// autres emails, l'utilisateur doit savoir immediatement si ca a echoue.
async function sendTestEmail(listing, toEmail) {
  await sendMail(
    toEmail,
    'Email de test - Mounesba',
    `<p>Ceci est un email de test envoyé depuis la configuration email de
     <strong>${listing.title}</strong> sur Mounesba.</p>
     <p>Si vous recevez ce message, votre configuration fonctionne correctement.</p>`,
    { listing, throwOnError: true }
  );
}

// Email de test envoye depuis Parametres admin > Email SMTP - passe par le
// chemin normal de sendMail (sans `listing`), donc teste exactement la
// configuration active pour tous les emails systeme.
async function sendPlatformTestEmail(toEmail) {
  await sendMail(
    toEmail,
    'Email de test - Mounesba (plateforme)',
    `<p>Ceci est un email de test envoyé depuis la configuration email de la plateforme Mounesba.</p>
     <p>Si vous recevez ce message, votre configuration fonctionne correctement.</p>`,
    { throwOnError: true }
  );
}

async function sendVerificationEmail(user, token) {
  const link = `${process.env.FRONTEND_URL}/verify-email/${token}`;
  await sendMail(
    user.email,
    'Confirmez votre email Mounesba',
    `<p>Bonjour ${user.firstName},</p>
     <p>Merci de confirmer votre email en cliquant sur le lien ci-dessous :</p>
     <p><a href="${link}">${link}</a></p>`
  );
}

async function sendPasswordResetEmail(user, token) {
  const link = `${process.env.FRONTEND_URL}/reset-password/${token}`;
  await sendMail(
    user.email,
    'Réinitialisation de votre mot de passe Mounesba',
    `<p>Bonjour ${user.firstName},</p>
     <p>Vous avez demandé la réinitialisation de votre mot de passe. Ce lien expire dans 1 heure :</p>
     <p><a href="${link}">${link}</a></p>
     <p>Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>`
  );
}

// Demande de location de vehicule (prestataire Transport, cf.
// leadController) : departureDatetime n'est renseigne que dans ce cas, donc
// sert de marqueur pour choisir le bon jeu de details a afficher au
// prestataire (dates/passagers/chauffeur plutot que date d'evenement/invites).
async function sendNewLeadEmail(providerUser, lead, listing) {
  const isTransportLead = Boolean(lead.departureDatetime);
  // Marqueur leger (meme principe que isTransportLead) : les champs produit
  // ne sont renseignes que pour les prestataires "Parfums & Soins", voir
  // leadController.createLead.
  const isProductLead = Boolean(lead.quantity || lead.deliveryDate || lead.deliveryMode);

  // Demande d'interet sur un evenement prestataire (M5) : le contexte est
  // deja donne par eventLine, pas besoin de repeter date/invites (non
  // renseignes pour ce type de demande, cf. leadController.createLead).
  const detailItems = lead.interestedEvent
    ? []
    : isTransportLead
    ? [
        `Départ : ${new Date(lead.departureDatetime).toLocaleString('fr-FR')}`,
        lead.returnDatetime
          ? `Retour : ${new Date(lead.returnDatetime).toLocaleString('fr-FR')}`
          : null,
        lead.passengers ? `Passagers : ${lead.passengers}` : null,
        lead.withDriver === true ? 'Avec chauffeur' : lead.withDriver === false ? 'Sans chauffeur' : null,
        lead.decoration ? `Décoration : ${lead.decoration.name}` : null,
        lead.selectedOptions?.length > 0
          ? `Options : ${lead.selectedOptions.map((s) => `${s.option?.name} x${s.quantity}`).join(', ')}`
          : null,
        lead.pickupLocation ? `Lieu de prise en charge : ${lead.pickupLocation}` : null,
      ]
    : isProductLead
    ? [
        lead.package ? `Produit souhaité : ${lead.package.name}` : null,
        lead.quantity ? `Quantité : ${lead.quantity}` : null,
        lead.deliveryDate ? `Date de livraison souhaitée : ${lead.deliveryDate}` : null,
        lead.deliveryMode === 'livraison'
          ? 'Mode : Livraison'
          : lead.deliveryMode === 'retrait'
          ? 'Mode : Retrait'
          : null,
        lead.deliveryMode === 'livraison' && lead.deliveryAddress
          ? `Adresse de livraison : ${lead.deliveryAddress}`
          : null,
        lead.customization ? `Personnalisation : ${lead.customization}` : null,
      ]
    : [
        `Date de l'événement : ${lead.eventDate || 'Non précisée'} ${lead.dateFlexible ? '(flexible)' : ''}`,
        `Nombre d'invités : ${lead.guests || 'Non précisé'}`,
      ];

  const eventLine = lead.interestedEvent
    ? `<p>Intéressé(e) par votre événement : <strong>${lead.interestedEvent.title}</strong></p>`
    : '';

  await sendMail(
    providerUser.email,
    lead.interestedEvent
      ? `Nouvelle demande d'intérêt - ${listing.title}`
      : `Nouvelle demande de devis - ${listing.title}`,
    `<p>Bonjour ${providerUser.firstName},</p>
     <p>Vous avez reçu une nouvelle demande pour <strong>${listing.title}</strong> :</p>
     ${eventLine}
     <ul>
       <li>Nom : ${lead.firstName} ${lead.lastName}</li>
       <li>Email : ${lead.email}</li>
       <li>Téléphone : ${lead.phone}</li>
       ${detailItems
         .filter(Boolean)
         .map((item) => `<li>${item}</li>`)
         .join('\n       ')}
       ${lead.message ? `<li>Message : ${lead.message}</li>` : ''}
     </ul>
     <p>Connectez-vous à votre tableau de bord pour répondre au client.</p>`
  );
}

async function sendLeadAcknowledgementEmail(lead, listing) {
  await sendMail(
    lead.email,
    'Votre demande a bien été envoyée - Mounesba',
    `<p>Bonjour ${lead.firstName},</p>
     <p>Votre demande de devis pour <strong>${listing.title}</strong> a bien été transmise au prestataire.</p>
     <p>Il vous recontactera directement par téléphone ou email dès que possible.</p>`
  );
}

async function sendContractEmail(client, contract, listing, pdfUrl) {
  if (!client?.email) return;
  const link = `${process.env.FRONTEND_URL}${pdfUrl}`;
  await sendMail(
    client.email,
    `Votre contrat - ${listing.title}`,
    `<p>Bonjour ${client.name},</p>
     <p><strong>${listing.title}</strong> vous a envoyé un contrat concernant : ${contract.object}.</p>
     <p>Vous pouvez le consulter et le télécharger ici : <a href="${link}">${link}</a></p>
     <p>Le règlement se fait directement avec le prestataire (espèces ou virement), hors plateforme.</p>`,
    { listing }
  );
}

async function sendInvoiceEmail(client, invoice, listing, pdfUrl) {
  if (!client?.email) return;
  const link = `${process.env.FRONTEND_URL}${pdfUrl}`;
  await sendMail(
    client.email,
    `Votre facture ${invoice.number} - ${listing.title}`,
    `<p>Bonjour ${client.name},</p>
     <p><strong>${listing.title}</strong> vous a envoyé la facture n° ${invoice.number}.</p>
     <p>Vous pouvez la consulter et la télécharger ici : <a href="${link}">${link}</a></p>`,
    { listing }
  );
}

async function sendProviderApprovedEmail(user, listing) {
  await sendMail(
    user.email,
    'Votre fiche Mounesba a été validée',
    `<p>Bonjour ${user.firstName},</p>
     <p>Bonne nouvelle : votre fiche <strong>${listing.title}</strong> a été validée par notre équipe
     et est désormais visible sur Mounesba.</p>`
  );
}

async function sendProviderRejectedEmail(user, listing, reason) {
  await sendMail(
    user.email,
    'Votre fiche Mounesba nécessite des modifications',
    `<p>Bonjour ${user.firstName},</p>
     <p>Votre fiche <strong>${listing.title}</strong> n'a pas été validée pour le motif suivant :</p>
     <p><em>${reason}</em></p>
     <p>Vous pouvez la mettre à jour depuis votre espace prestataire et la soumettre à nouveau.</p>`
  );
}

// Activation/desactivation d'une fiche par l'admin (Super Admin/Moderateur) —
// envoye a chaque changement de statut, motif optionnel inclus s'il est fourni.
async function sendProviderStatusChangedEmail(user, listing, status, reason) {
  if (!user?.email) return;

  if (status === 'active') {
    await sendMail(
      user.email,
      'Votre fiche Mounesba est de nouveau active',
      `<p>Bonjour ${user.firstName},</p>
       <p>Votre fiche <strong>${listing.title}</strong> est de nouveau active et visible sur Mounesba.</p>`
    );
    return;
  }

  await sendMail(
    user.email,
    'Votre fiche Mounesba a été suspendue',
    `<p>Bonjour ${user.firstName},</p>
     <p>Votre fiche <strong>${listing.title}</strong> a été suspendue par notre équipe et n'est
     plus visible sur la plateforme.</p>
     ${reason ? `<p>Motif : <em>${reason}</em></p>` : ''}
     <p>Contactez le support si vous pensez qu'il s'agit d'une erreur.</p>`
  );
}

// Rappel J-7 avant echeance d'abonnement payant (US-P10, MODULES.md M9).
async function sendSubscriptionExpiryReminderEmail(user, subscription) {
  if (!user?.email) return;

  await sendMail(
    user.email,
    'Votre abonnement Mounesba expire dans 7 jours',
    `<p>Bonjour ${user.firstName},</p>
     <p>Votre abonnement <strong>${subscription.plan}</strong> arrive à échéance le
     <strong>${subscription.endDate}</strong>.</p>
     <p>Contactez notre équipe pour renouveler votre abonnement et continuer à profiter
     de vos fonctionnalités (le règlement se fait hors plateforme, cash ou virement RIB).</p>`
  );
}

// Facture d'abonnement (admin -> prestataire, M9) : contrairement a
// sendInvoiceEmail (prestataire -> client), toujours envoyee via le SMTP de
// la plateforme (pas de `listing` passe a sendMail) - c'est Mounesba qui
// facture le prestataire, jamais l'inverse.
async function sendSubscriptionInvoiceEmail(owner, invoice, pdfUrl) {
  if (!owner?.email) return;
  const link = `${process.env.FRONTEND_URL}${pdfUrl}`;
  await sendMail(
    owner.email,
    `Votre facture d'abonnement ${invoice.number} - Mounesba`,
    `<p>Bonjour ${owner.firstName},</p>
     <p>Voici votre facture d'abonnement Mounesba n° ${invoice.number}, d'un montant de
     ${Number(invoice.amount).toFixed(2)} DT.</p>
     <p>Vous pouvez la consulter et la télécharger ici : <a href="${link}">${link}</a></p>
     <p>Le règlement se fait hors plateforme (espèces ou virement RIB).</p>`
  );
}

// Les autres templates (nouvel avis) seront centralisés ici en Phase 10
// (module M12) — voir docs/Prompts.md, Prompt 10.1.

module.exports = {
  sendMail,
  sendTestEmail,
  sendPlatformTestEmail,
  clearPlatformSettingsCache,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendNewLeadEmail,
  sendLeadAcknowledgementEmail,
  sendContractEmail,
  sendInvoiceEmail,
  sendProviderApprovedEmail,
  sendProviderRejectedEmail,
  sendProviderStatusChangedEmail,
  sendSubscriptionExpiryReminderEmail,
  sendSubscriptionInvoiceEmail,
};
