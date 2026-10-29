/* The current chapter focuses on restoring the machine. Later systems stay
 * saved and visible; machine activation restores their full functionality.
 * No DOM, clock, save-format changes or mutation of earned equipment. */
export const FOCUSED_TOOL_LIMITS = Object.freeze({ basket: 0, pickaxe: 3, boots: 2, overclock: 0 });
const OPTIONAL = new Set(['garden','quarry','mine','stoneworks','depot','vault','conduit','basket','overclock','flare','reinforce','shade']);
export const focusedChapter = s => !!s.cultivation && !s.cultivation.completed;
export const contentLocked = (s, id) => focusedChapter(s) && OPTIONAL.has(id);
export function effectiveToolLevel(s, id) {
  const owned = s.tools[id] || 0;
  return focusedChapter(s) && Object.hasOwn(FOCUSED_TOOL_LIMITS,id) ? Math.min(owned,FOCUSED_TOOL_LIMITS[id]) : owned;
}
export function toolPurchaseLocked(s, id) {
  return focusedChapter(s) && Object.hasOwn(FOCUSED_TOOL_LIMITS,id) && Math.max(1,s.tools[id])+1 > FOCUSED_TOOL_LIMITS[id];
}
