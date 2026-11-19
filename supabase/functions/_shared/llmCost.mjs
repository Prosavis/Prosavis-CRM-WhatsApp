/**
 * Tarifas de lista usadas para el libro de Sofía, en USD por millón de tokens.
 * Anthropic Sonnet: 3 de entrada y 15 de salida. Gemini: las mismas que el molde
 * de fichas (0,75 y 3,75). Un proveedor desconocido queda en 0 y se nota en el libro.
 */

export const LLM_RATES_USD_PER_MILLION = {
  anthropic: { input: 3, output: 15 },
  google: { input: 0.75, output: 3.75 },
};

export function llmCostUsd(provider, inputTokens, outputTokens) {
  const rates = LLM_RATES_USD_PER_MILLION[provider] ?? { input: 0, output: 0 };
  const input = Number(inputTokens) || 0;
  const output = Number(outputTokens) || 0;
  const usd = (input * rates.input + output * rates.output) / 1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
