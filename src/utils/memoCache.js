// Cache memoire en processus, TTL court, pour des lectures publiques peu
// changeantes (categories, villes) qui sont interrogees a chaque visite de
// page par de nombreux visiteurs. La base MySQL hebergee n'accepte qu'un
// petit nombre de connexions simultanees (voir src/config/database.js) : ce
// cache evite de retaper la base a chaque requete pour des donnees qui ne
// changent en pratique que via l'admin, quelques fois par jour tout au plus.
// Cache "best effort" propre a chaque instance serverless (reinitialise a
// froid) - pas une source de verite partagee, juste un amortisseur de charge.
//
// fn doit etre une fonction async sans argument. Les appels concurrents
// pendant le calcul partagent la meme promesse (pas de calculs paralleles
// redondants).
function memoize(fn, ttlMs) {
  let cached = null; // { value, expiresAt }
  let inFlight = null;

  const memoized = async function memoized() {
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }
    if (inFlight) return inFlight;

    inFlight = fn()
      .then((value) => {
        cached = { value, expiresAt: Date.now() + ttlMs };
        return value;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  // A appeler juste apres toute ecriture admin sur les donnees mises en
  // cache (creation/modification/suppression d'une categorie, d'un service
  // associe, d'une ville...) pour que le changement soit visible publiquement
  // immediatement plutot que d'attendre l'expiration du TTL.
  memoized.invalidate = () => {
    cached = null;
  };

  return memoized;
}

module.exports = { memoize };
