# Cas de comparaison à supports non linéaires

Jeux de données pour le logiciel de comparaison et valeurs attendues calculées
par l'application, pour valider le solveur non linéaire (§ 7 de
[THEORIE.md](../THEORIE.md)). La comparaison reste à faire : voir le point 12 de
[QUESTIONS.md](../QUESTIONS.md).

| Fichier | Contenu |
|---|---|
| `nl-appui-jeu.fre` | Jeu de données sans frottement : appui simple qui décolle à chaud, butée à jeu de 5 mm qui se ferme |
| `nl-appui-jeu-valeurs-attendues.md` | Valeurs attendues : états 100 (poids seul) et 101 (poids + dilatation), étendue, contraintes, base linéaire, fréquences |
| `nl-appui-jeu-frottement.fre` | Même modèle avec un frottement μ = 0,3 sur les trois supports |
| `nl-appui-jeu-frottement-valeurs-attendues.md` | Valeurs attendues avec frottement |
| `valeurs-attendues.mjs` | Script qui réécrit les deux fiches : `node docs/validation/valeurs-attendues.mjs` |

Le modèle jumeau est l'exemple « Cas non linéaire – appui qui décolle, jeu
rattrapé, frottement » de l'application (bouton Exemple). Pour la variante sans
frottement, vider la colonne « Frottement μ » des trois supports.

Chaque jeu de données contient deux cas linéaires et un modal (les supports non
linéaires y agissent comme des blocages ordinaires), pour contrôler d'abord que
les deux modèles sont identiques, puis les deux états non linéaires et leur
combinaison en étendue.

Les valeurs principales des fiches sont figées par les tests
(`tests/friction.test.mjs`) : si un test échoue après une modification du
solveur, relancer le script et relire les fiches.

Points de saisie non vérifiés sur le logiciel de comparaison, à contrôler à la
première exécution :

- le cas 101 est déclaré comme un cas de poids (`TY=3`) dont la carte `OPER` est
  à 300 °C : d'après l'aide en ligne, il contient alors le poids et la
  dilatation. Le déplacement vertical du point 21 doit valoir environ +11,4 mm ;
- l'étendue (cas 200) est formée par `CCAS ME=9` entre les cas 100 et 101 : elle
  n'est probablement pas ramenée au module à froid, d'où les deux colonnes de
  l'éq. (7) dans les fiches.
