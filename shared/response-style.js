// Facial cues select a delivery style only. They never establish a feeling.
export function responseStyle(context, now = Date.now()) {
  if (!context?.active) return 'neutral';
  if (context.feeling === 'fine') return 'neutral';
  if (['tired', 'stuck'].includes(context.feeling)) return 'gentle';
  const cue = context.cue;
  if (context.source !== 'presage' || cue?.source !== 'presage' || !context.sessionId || cue.sessionId !== context.sessionId) return 'neutral';
  if (!Number.isSafeInteger(cue.observedAt) || now - cue.observedAt > 5000 || cue.observedAt > now + 1000) return 'neutral';
  return ['gentle', 'upbeat'].includes(cue.tone) ? cue.tone : 'neutral';
}

export function wakeGreeting(style) {
  if (style === 'gentle') return 'I’m here. We can take it one step at a time.';
  if (style === 'upbeat') return 'Hey! What would you like to work on?';
  return 'I’m here. What can I help with?';
}

export function responseStyleInstruction(style) {
  const delivery = style === 'gentle'
    ? 'Use a calm, low-pressure tone. Keep the first answer short and offer one manageable next step when useful.'
    : style === 'upbeat'
      ? 'Use a lightly upbeat, friendly tone while remaining concise. Avoid exaggerated praise.'
      : 'Use your usual warm, concise tone.';
  return `Optional delivery style: ${delivery} A style hint is not a statement of the user’s feelings. Never say a face or sensor reveals an emotion; never use this hint to report_feeling, suggest a diagnosis, change a plan, trigger an action, or insist on a break. The user’s current words and explicit tone preferences always take priority.`;
}
