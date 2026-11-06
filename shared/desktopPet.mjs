export const DEFAULT_PET_PREFERENCES = { enabled: false, scale: 1, roaming: true, alwaysOnTop: true };
export const PET_VIEWPORT = { width: 320, height: 560 };
export function clampPetPosition(point, area, size = PET_VIEWPORT) {
    return {
        x: Math.round(Math.max(area.x, Math.min(point.x, area.x + Math.max(0, area.width - size.width)))),
        y: Math.round(Math.max(area.y, Math.min(point.y, area.y + Math.max(0, area.height - size.height)))),
    };
}
export function sanitizePreferences(input) {
    return {
        enabled: input.enabled === true,
        scale: typeof input.scale === 'number' && Number.isFinite(input.scale) ? Math.min(1.4, Math.max(.65, input.scale)) : 1,
        roaming: typeof input.roaming === 'boolean' ? input.roaming : true,
        alwaysOnTop: typeof input.alwaysOnTop === 'boolean' ? input.alwaysOnTop : true,
    };
}
/** Attention wins over background work; acknowledged/old completions do not keep jumping. */
export function selectPetTask(tasks, now = Date.now()) {
    const newest = (phase) => tasks.filter(t => t.phase === phase).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    return tasks.filter(t => !t.acknowledged && (t.phase === 'failed' || t.phase === 'waiting'))
        .sort((a, b) => (a.phase === b.phase ? b.updatedAt - a.updatedAt : a.phase === 'failed' ? -1 : 1))[0]
        ?? newest('working')
        ?? tasks.filter(t => !t.acknowledged && t.phase === 'completed' && now - t.updatedAt < 8000).sort((a, b) => b.updatedAt - a.updatedAt)[0];
}
/** Keep the character visible anywhere, without constraining it by menu whitespace. */
export function layoutPet(point, area, scale=1) {
 const size={width:144*scale,height:156*scale};
 const character=clampPetPosition(point,area,size);
 const boundsSize={width:Math.min(PET_VIEWPORT.width,area.width),height:Math.min(PET_VIEWPORT.height,area.height)};
 const origin=clampPetPosition({x:character.x+size.width/2-boundsSize.width/2,y:character.y+size.height+12-boundsSize.height},area,boundsSize);
 return {point:character,bounds:{...origin,...boundsSize},bodyX:character.x-origin.x,bodyY:character.y-origin.y};
}
