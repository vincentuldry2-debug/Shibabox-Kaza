# ShibaBox V19.1 Crash Fixed

La V19 plantait à cause d’un ancien morceau de code Twitch resté dans `server.js`.
Cette version supprime ce code et le fichier serveur passe maintenant la vérification Node.

Pour mettre à jour Railway :
1. Décompresse ce ZIP.
2. Remplace tous les fichiers de ton dépôt GitHub.
3. Clique sur Commit changes.
4. Railway redéploiera automatiquement.
5. Dans les logs, tu dois voir :
   `ShibaBox V19.1 Crash Fixed running on port ...`
