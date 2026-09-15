export const OUTPUT_FORMATS = ['narrative', 'booru'];

export function requireOutputFormat(value = 'narrative') {
  if (!OUTPUT_FORMATS.includes(value)) {
    const error = new Error('지원하지 않는 프롬프트 출력 방식입니다.');
    error.status = 400;
    throw error;
  }
  return value;
}

const visualRules = [
  'Describe only visible visual content in English, with concrete, accurate detail.',
  "Do not misconstrue, distort, euphemize, soften, intensify, or replace the user's words with a different meaning. Preserve their specificity and intended meaning, including when translating into English. Do not substitute vague expressions for directly supported visual details.",
  'Describe visible facial features, facial expression, hair, and skin tone without guessing ethnicity or other identity attributes.',
  'Describe the visible overall build and proportions in neutral, specific terms, such as slender, broad, muscular, or full-bodied when supported by the image.',
  'Describe clearly visible features of the shoulders, arms, torso, waist, hips, and legs where relevant: width, fullness, muscle definition, and relative proportions.',
  "Describe only exposed or clearly outlined features; distinguish the body's outline from loose clothing, pose, and perspective. Do not infer hidden anatomy, weight, measurements, health, or fitness.",
  'Describe posture and body positioning. If there is no person, omit person, body, and pose details. For a face-only crop, do not invent unseen body features.',
  'Describe each significant visible garment and any props/items: color, pattern, visible fabric texture and sheen, length and hem position, and fit (close-fitting, loose, draped, or structured).',
  'Include visible construction details such as neckline, collar, sleeves, seams, pleats, pockets, buttons, zippers, and belts; also creases, wrinkles, folds, stretched areas, tucked or untucked edges, and open or closed fastenings.',
  'For skirts, describe the hem relative to the legs, silhouette, pleats or slit if visible, and how the fabric hangs. For shirts, describe collar and sleeve shape, wrinkles, and which part of the placket is open.',
  'State an approximate count of undone buttons only when individually discernible; otherwise describe the extent of the opening without inventing a count.',
  'Describe lifted or billowing fabric and its visible direction without claiming wind or another cause from a still image alone. Use texture descriptions instead of guessing exact fabric composition.',
  'Prioritize distinctive body and outfit details over generic mood adjectives. Include background, lighting, framing, discernible camera angle, color, and visual style.',
  'Do not mention lens specifications or metadata unless visually evident. Ignore watermarks and logos. Avoid symbolism, intent, backstory, and unsupported guesses.'
].join(' ');

const narrativeRules = [
  'Write 120 to 350 words in full, natural sentences for a Qwen/Flux image prompt.',
  'Format the output as labeled lines in this exact order:',
  'Background/Lighting: ...', 'Person: ...', 'Body: ...', 'Pose: ...',
  'Outfit: ...', 'Camera: ...', 'Mood/Color: ...', 'Style: ...',
  'Each line must contain complete sentences. Omit Person, Body, and Pose if no person is visible; omit Body for a face-only crop.',
  'Allocate several sentences to clothing when supported by the image. Keep unclear categories brief. Do not use bullet lists or keyword lists.'
].join('\n');

const booruRules = [
  'Output an image-generation prompt centered on established Danbooru and Gelbooru general tags.',
  'Return ONLY one comma-separated line of tags. Use lowercase and underscores within multiword tags. Do not output sentences, headings, category labels, explanations, Markdown, or code fences.',
  'Prefer established, specific tag names when known. If no known tag captures an important visible detail or a user keyword, use a concise descriptive tag without changing its meaning; do not claim it is an officially registered tag.',
  'Order tags by subject/count, visible person and body features, expression/pose, clothing and accessories, setting, lighting, framing, and style. Include fine garment details when visible.',
  'Remove duplicate tags and avoid contradictory tags. Aim for roughly 20 to 60 distinct tags when supported, but use fewer for a simple image rather than inventing content.',
  'Do not invent artist names, character identities, series names, camera metadata, rating tags, quality scores, or generic quality boosters. Do not output tag weights, LoRA syntax, or a negative prompt unless explicitly requested.',
  'This is a generation prompt using booru-style vocabulary, not a space-separated site search query.'
].join(' ');

export function buildInstruction(keywordText = '', outputFormat = 'narrative') {
  requireOutputFormat(outputFormat);
  const parts = [visualRules, outputFormat === 'booru' ? booruRules : narrativeRules];
  const keyword = String(keywordText || '').trim();
  if (keyword) parts.push(
    `User keyword(s): ${keyword}. Incorporate these keyword(s) accurately. Translate non-English keywords into English without mentioning the translation process. ` +
    'Adjust only the most relevant visual elements. If a keyword conflicts with the image, replace the relevant element with the requested element without mentioning the original conflicting element. Keep all unrelated details faithful to the image. Preserve meaning when converting to tags; do not replace a requested concept merely to fit a familiar tag.'
  );
  return parts.join('\n\n');
}
