/**
 * Remove unpaired UTF-16 surrogate code units from a string. A valid surrogate
 * pair (high D800–DBFF followed by low DC00–DFFF) is kept; a high surrogate not
 * followed by a low one, or a low surrogate not preceded by a high one, is
 * dropped. Unpaired surrogates serialize to invalid JSON and make AI providers
 * reject the request body ("invalid high surrogate"). Apply to every
 * model-bound string (grounding + message text).
 */
export function stripLoneSurrogates(input: string): string {
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += input[i] + input[i + 1];
        i++;
      }
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // lone low surrogate: drop
    } else {
      out += input[i];
    }
  }
  return out;
}
