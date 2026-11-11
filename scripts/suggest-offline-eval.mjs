#!/usr/bin/env node
// Experimento offline de la sugerencia.
// No llama a Gemini y no lee producción. El set de 40 a 60 chats
// anonimizados se queda en la máquina, fuera del repo.
//
// Variantes a contrastar, cuando exista ese archivo local:
// - thinking medium frente a low, en booking y en sugerencia
// - gemini-3.8-flash frente a gemini-3.5-flash-lite para booking

const input = process.env.SUGGEST_EVAL_INPUT;
if (!input) {
  process.stdout.write(
    'Sin SUGGEST_EVAL_INPUT. No se llama a Gemini y no se leen chats de producción.\n',
  );
  process.exit(0);
}

process.stdout.write(
  'El set local no se evalúa desde el repo. Usa scoreSuggestionRules sobre el JSON anonimizado.\n',
);
process.exit(0);
