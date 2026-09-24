// Stockage des fichiers uploades (images/videos/icones) sur Cloudinary quand
// les identifiants sont fournis (obligatoire en production : le systeme de
// fichiers des plateformes serverless comme Vercel est en lecture seule hors
// /tmp, donc fs.writeFileSync echoue silencieusement en erreur 500 des qu'un
// upload est tente - vu en prod sur l'ajout de photo aux modeles de
// decoration vehicule). En developpement local, sans ces variables, les
// fonctions de upload.js retombent sur l'ecriture disque classique.
const cloudinary = require('cloudinary').v2;

const isConfigured = Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
);

if (isConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

// Upload d'un buffer deja verifie (contenu et taille) - resourceType vaut
// 'image', 'video' ou 'raw' (icones SVG : Cloudinary bloque par defaut la
// diffusion de SVG comme image pour eviter le XSS, or le contenu a deja ete
// assaini par sanitizeSvg avant d'arriver ici, donc 'raw' est sans risque et
// evite d'exiger un reglage compte supplementaire).
function uploadBuffer(buffer, { folder, resourceType = 'image', format } = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `mounesba/${folder}`, resource_type: resourceType, format },
      (err, result) => {
        if (err) return reject(err);
        return resolve(result);
      }
    );
    stream.end(buffer);
  });
}

// Extrait le public_id Cloudinary (avec dossier) a partir d'une URL de
// livraison, pour permettre la suppression de l'ancien fichier lors d'un
// remplacement. Renvoie null si l'URL ne vient pas de Cloudinary.
function extractPublicId(url) {
  if (!url || !url.includes('res.cloudinary.com')) return null;
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)\.[a-zA-Z0-9]+$/);
  return match ? match[1] : null;
}

function destroy(url, resourceType = 'image') {
  const publicId = extractPublicId(url);
  if (!publicId) return;
  cloudinary.uploader.destroy(publicId, { resource_type: resourceType }, () => {});
}

module.exports = { isConfigured, uploadBuffer, destroy };
