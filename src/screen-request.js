// Interpret the user's current words locally, before sending the Gemini request.
// A one-shot request never enables continuous screen sharing.
export function shouldCaptureScreen(text,{sharing=false,once=false}={}){
  const value=String(text).toLowerCase().replace(/[’]/g,"'");
  if(/\b(don't|do not|never|stop|disable|turn off)\b[^.!?]{0,60}\b(screen|screenshot|screen ?shot|screen ?sharing|capture|recording)\b/.test(value))return false;
  if(sharing||once)return true;
  if(/\b(how (do|can|would) (i|you|we)|how to|explain how|what is|what's)\b[^.!?]{0,55}\b(screenshot|screen ?shot|screen capture)\b/.test(value))return false;
  if(/\b(take|grab|capture|send|share|snap)\b[^.!?]{0,40}\b(screenshot|screen ?shot|screen|display|desktop)\b/.test(value))return true;
  if(/\b(summari[sz]e|summary|summari[sz]ation|overview|recap)\b[^.!?]{0,60}\b(my|this|the|current)\s+(screen|page|display|desktop)\b/.test(value))return true;
  if(/\b(look at|check|see|view|read|analy[sz]e|explain|help (me )?with)\b[^.!?]{0,50}\b(my|this|the|current)\s+(screen|page|display|desktop)\b/.test(value))return true;
  if(/\b(what|what's|where|which|why)\b[^.!?]{0,65}\b(on (my|the|this) screen|i'?m looking at)\b/.test(value))return true;
  return /\b(screen|page)\b/.test(value)&&/\b(notes|checklist|study guide|slides|presentation)\b/.test(value);
}
