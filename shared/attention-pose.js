const degrees=180/Math.PI;
export function headAngles(matrix){
  if(!matrix||matrix.length!==16||!Array.from(matrix).every(Number.isFinite))return null;
  // Column-major canonical-face transform; use the forward axis, ignoring translation.
  const [x,y,z]=[matrix[8],matrix[9],matrix[10]];
  if(Math.hypot(x,y,z)<.01)return null;
  return {pitch:Math.atan2(-y,Math.hypot(x,z))*degrees,yaw:Math.atan2(x,z)*degrees};
}
export const angleDistance=(a,b)=>Math.abs(((a-b+540)%360)-180);
export function classifyAttentionPose(pose,baseline,phone){
  if(!pose||!baseline)return {state:'unknown',tilt:null};
  const tilt=Number.isFinite(pose.pitch)&&Number.isFinite(baseline.pitch)?angleDistance(pose.pitch,baseline.pitch):null;
  const turn=Number.isFinite(pose.yaw)&&Number.isFinite(baseline.yaw)?angleDistance(pose.yaw,baseline.yaw):0;
  const horizontal=Math.abs(pose.x-baseline.x),vertical=Math.abs(pose.y-baseline.y);
  // A visible phone supports a smaller tilt; it is never required for a clear head tilt.
  const state=phone&&((tilt??0)>=12||vertical>.12)?'phone':(tilt??0)>=18||turn>=28||horizontal>.22||vertical>.23?'away':'screen';
  return {state,tilt};
}
