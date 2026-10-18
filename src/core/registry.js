// Registre générique : chaque famille extensible de l'application (composants,
// types de chargement, codes de vérification) est un registre d'objets
// « définition » identifiés par `id`. Ajouter une fonctionnalité revient à écrire
// un module qui appelle `register(...)` — aucun autre fichier n'est à modifier.

export class Registry {
  constructor(kind) {
    this.kind = kind;
    this.items = new Map();
  }

  register(def) {
    if (!def || !def.id) throw new Error(`${this.kind} : définition sans id`);
    this.items.set(def.id, def);
    return def;
  }

  has(id) {
    return this.items.has(id);
  }

  get(id) {
    const def = this.items.get(id);
    if (!def) throw new Error(`${this.kind} inconnu : « ${id} »`);
    return def;
  }

  list() {
    return [...this.items.values()];
  }
}
