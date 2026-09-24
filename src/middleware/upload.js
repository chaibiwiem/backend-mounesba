const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { sanitizeSvg, MAX_SVG_SIZE } = require('../utils/sanitizeSvg');
const cloudinaryStorage = require('../services/cloudinaryStorage');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 Mo
const UPLOAD_DIR = path.join(__dirname, '../../uploads/listings');

// Systeme de fichiers en lecture seule sur les plateformes serverless
// (Vercel...) hors /tmp : selon le montage, une ecriture refusee remonte en
// EROFS ou en ENOENT (repertoire "introuvable" car impossible a creer). Ne
// jamais laisser mkdirSync faire planter le chargement du module (donc toute
// l'app) au demarrage - best-effort, non bloquant.
function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error(`Impossible de creer le dossier d'upload ${dir} :`, err.message);
  }
}

ensureDir(UPLOAD_DIR);

const MAGIC_BYTES = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

// Détecte le vrai format à partir du contenu binaire (signature de fichier),
// jamais à partir de l'extension ou du Content-Type déclaré par le client
// (facilement falsifiables) — CLAUDE.md, section Uploads.
function detectRealMimeType(buffer) {
  const match = Object.entries(MAGIC_BYTES).find(([, signature]) =>
    signature.every((byte, index) => buffer[index] === byte)
  );
  return match ? match[0] : null;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

// Écrit un buffer déjà vérifié sur disque, sous un nom aléatoire (jamais le
// nom d'origine), dans le dossier fourni. Renvoie le nom de fichier ou null
// si le contenu n'est pas une vraie image JPG/PNG. Reserve aux fichiers qui
// doivent rester locaux (documents legaux, jamais publics) - pour toute image
// destinee a etre servie publiquement, voir persistImageToStorage ci-dessous.
function persistBuffer(buffer, destDir) {
  const realMimeType = detectRealMimeType(buffer);
  if (!realMimeType) return null;

  ensureDir(destDir);
  const extension = realMimeType === 'image/png' ? '.png' : '.jpg';
  const filename = `${crypto.randomBytes(16).toString('hex')}${extension}`;
  fs.writeFileSync(path.join(destDir, filename), buffer);
  return filename;
}

// Stocke une image publique (galerie, vehicules, decorations, evenements,
// avis, vignettes video...) sur Cloudinary quand des identifiants sont
// configures (obligatoire en production serverless), sinon sur le disque
// local sous uploads/<folder> (dev local uniquement). Renvoie l'URL complete
// a stocker telle quelle en base (deja absolue pour Cloudinary, relative
// /uploads/... sinon - cf. getMediaUrl cote frontend).
async function persistImageToStorage(buffer, folder) {
  const realMimeType = detectRealMimeType(buffer);
  if (!realMimeType) return { url: null, error: true };

  if (cloudinaryStorage.isConfigured) {
    const format = realMimeType === 'image/png' ? 'png' : 'jpg';
    const result = await cloudinaryStorage.uploadBuffer(buffer, { folder, resourceType: 'image', format });
    return { url: result.secure_url, error: null };
  }

  const destDir = path.join(__dirname, '../../uploads', folder);
  ensureDir(destDir);
  const extension = realMimeType === 'image/png' ? '.png' : '.jpg';
  const filename = `${crypto.randomBytes(16).toString('hex')}${extension}`;
  fs.writeFileSync(path.join(destDir, filename), buffer);
  return { url: `/uploads/${folder}/${filename}`, error: null };
}

// À chaîner après upload.single('image') : stocke le fichier une fois le
// contenu vérifié (galerie prestataire, logo, icône de catégorie...).
async function persistVerifiedImage(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ message: 'Aucun fichier reçu.' });
  }

  try {
    const { url, error } = await persistImageToStorage(req.file.buffer, 'listings');
    if (error) {
      return res
        .status(400)
        .json({ message: 'Format de fichier non supporté. Utilisez JPG ou PNG.' });
    }

    req.uploadedFile = { url };
    return next();
  } catch (err) {
    return next(err);
  }
}

// Verifie/stocke un fichier image optionnel (contrairement a la galerie
// photos ou l'image est obligatoire) - utilise par les vehicules et leurs
// modeles de decoration, qui peuvent etre crees/modifies sans photo.
async function persistOptionalImage(file, res) {
  if (!file) return { imageUrl: undefined, error: null };

  const { url, error } = await persistImageToStorage(file.buffer, 'listings');
  if (error) {
    res.status(400).json({ message: 'Image invalide. Utilisez JPG ou PNG.' });
    return { imageUrl: undefined, error: true };
  }

  return { imageUrl: url, error: null };
}

// Remplace la valeur d'un champ image sur une instance Sequelize par la
// nouvelle URL, en supprimant l'ancien fichier (best-effort, non bloquant) -
// sur Cloudinary ou sur le disque local selon d'ou vient l'URL precedente.
// No-op si aucune nouvelle image n'a ete fournie.
function replaceStoredFile(instance, field, newImageUrl) {
  if (!newImageUrl) return;
  const previousImage = instance[field];
  instance[field] = newImageUrl;
  if (!previousImage) return;

  if (/^https?:\/\//i.test(previousImage)) {
    cloudinaryStorage.destroy(previousImage);
  } else if (previousImage.startsWith('/uploads/listings/')) {
    const previousPath = path.join(UPLOAD_DIR, path.basename(previousImage));
    fs.unlink(previousPath, () => {});
  }
}

const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50 Mo
const VIDEO_UPLOAD_DIR = path.join(__dirname, '../../uploads/videos');

ensureDir(VIDEO_UPLOAD_DIR);

// mp4 : signature 'ftyp' a l'offset 4 (pas 0). webm : en-tete EBML a l'offset 0.
const VIDEO_MAGIC_BYTES = {
  'video/mp4': { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  'video/webm': { bytes: [0x1a, 0x45, 0xdf, 0xa3], offset: 0 },
};

function detectRealVideoMimeType(buffer) {
  const match = Object.entries(VIDEO_MAGIC_BYTES).find(([, sig]) =>
    sig.bytes.every((byte, index) => buffer[sig.offset + index] === byte)
  );
  return match ? match[0] : null;
}

// Stocke une video deja verifiee sur Cloudinary (production) ou sur le disque
// local (dev). Renvoie l'URL complete, ou null si le contenu n'est pas un
// vrai MP4/WebM.
async function persistVideoToStorage(buffer) {
  const realMimeType = detectRealVideoMimeType(buffer);
  if (!realMimeType) return null;

  if (cloudinaryStorage.isConfigured) {
    const format = realMimeType === 'video/webm' ? 'webm' : 'mp4';
    const result = await cloudinaryStorage.uploadBuffer(buffer, {
      folder: 'videos',
      resourceType: 'video',
      format,
    });
    return result.secure_url;
  }

  const extension = realMimeType === 'video/webm' ? '.webm' : '.mp4';
  const filename = `${crypto.randomBytes(16).toString('hex')}${extension}`;
  fs.writeFileSync(path.join(VIDEO_UPLOAD_DIR, filename), buffer);
  return `/uploads/videos/${filename}`;
}

// Accepte le champ 'video' (upload direct, galerie video) et/ou 'thumbnail'
// (vignette personnalisee JPG/PNG, optionnelle — pour un lien YouTube/Vimeo
// ou un upload direct). La verification/le stockage se font dans le
// controller (les deux champs ont des regles de format differentes).
const uploadVideoFields = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_SIZE },
});

// Accepte uniquement 'thumbnail' (JPG/PNG, 5 Mo max comme les photos) —
// utilise pour l'ajout d'un lien video, ou aucun fichier video n'est envoye.
const uploadThumbnailOnly = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

// Icone SVG d'une categorie (admin uniquement). Exception documentee a la
// regle "JPG/PNG uniquement" de CLAUDE.md : un SVG est du texte/XML, pas une
// image binaire, donc pas de signature "magic bytes" a verifier - a la place
// le contenu est assaini (voir utils/sanitizeSvg.js) avant d'etre stocke.
// Limite basse (100 Ko) car une icone n'a pas besoin de plus. Sur Cloudinary,
// stocke en resource_type 'raw' (le contenu deja assaini ne presente pas le
// risque XSS que Cloudinary bloque par defaut pour les SVG servis en image).
const ICON_UPLOAD_DIR = path.join(__dirname, '../../uploads/icons');
ensureDir(ICON_UPLOAD_DIR);

const uploadIcon = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SVG_SIZE },
});

// A chainer apres uploadIcon.single('icon') : assainit puis stocke le SVG.
async function persistVerifiedIcon(req, res, next) {
  if (!req.file) {
    return res.status(400).json({ message: 'Aucun fichier reçu.' });
  }

  const sanitized = sanitizeSvg(req.file.buffer);
  if (!sanitized) {
    return res.status(400).json({ message: 'Fichier SVG invalide ou non supporté.' });
  }

  try {
    if (cloudinaryStorage.isConfigured) {
      const result = await cloudinaryStorage.uploadBuffer(sanitized, {
        folder: 'icons',
        resourceType: 'raw',
        format: 'svg',
      });
      req.uploadedFile = { url: result.secure_url };
      return next();
    }

    const filename = `${crypto.randomBytes(16).toString('hex')}.svg`;
    fs.writeFileSync(path.join(ICON_UPLOAD_DIR, filename), sanitized);
    req.uploadedFile = { url: `/uploads/icons/${filename}` };
    return next();
  } catch (err) {
    return next(err);
  }
}

// Documents legaux sensibles (carte CIN du gerant...) - CLAUDE.md, section
// Securite : "acces restreint, chiffrement au repos si possible". Stocke
// volontairement HORS de backend/uploads (jamais servi par le
// `express.static('/uploads', ...)` de app.js, contrairement aux
// photos/videos) : seul un endpoint authentifie (proprietaire de la fiche ou
// admin) peut les lire, jamais une URL publique devinable. Reste sur le
// disque local pour l'instant (pas encore migre vers un stockage externe a
// livraison authentifiee) - a la difference des photos/videos publiques,
// donc toujours sujet a la limite disque en lecture seule des plateformes
// serverless (Vercel) en production.
const LEGAL_UPLOAD_DIR = path.join(__dirname, '../../private-uploads/legal');
ensureDir(LEGAL_UPLOAD_DIR);

module.exports = {
  upload,
  persistVerifiedImage,
  persistOptionalImage,
  persistImageToStorage,
  replaceStoredFile,
  persistBuffer,
  detectRealMimeType,
  UPLOAD_DIR,
  uploadVideoFields,
  uploadThumbnailOnly,
  persistVideoToStorage,
  detectRealVideoMimeType,
  VIDEO_UPLOAD_DIR,
  LEGAL_UPLOAD_DIR,
  uploadIcon,
  persistVerifiedIcon,
  ICON_UPLOAD_DIR,
};
