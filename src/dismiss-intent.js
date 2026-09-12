// Conservative shortcut for complete, unambiguous dismissal phrases.
// Longer/contextual requests are handled by Gemini's close_assistance tool.
export function isDismissal(text){
  const value=text.toLowerCase().replace(/[’]/g,"'").replace(/[.!?,]/g,'').trim();
  return /^(?:(?:okay|ok|hey|actually) )?(?:no thanks|no thank you|not now|stop talking|leave me alone|go away|close (?:this|the) (?:window|chat)|(?:i'm|i am|we're|we are) (?:done|all done|finished)|(?:i )?(?:don't|do not) (?:need|want) (?:your |any |the )?(?:help|assistance)|that's all|that is all|thanks that's all|thanks i'm done)(?: (?:please|thanks|thank you|for now))?$/.test(value);
}
