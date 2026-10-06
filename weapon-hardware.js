// Combined firing modes can require several of the same physical weapons.
// Different independent slots remain independent unless data declares overlap.
export function hardwareBusy(u,state) {
    const parts=state.definition.hardwareParts;
    return !!parts?.length && u.weapons.some(other => other!==state && (other.attack||other.salvo||other.deployed)
        && other.definition.hardwareParts?.some(part=>parts.includes(part)));
}
export function validateWeaponHardware(machine) {
    for(const w of machine.weapons) if(w.hardwareParts!==undefined) {
        const p=w.hardwareParts;
        if(!Array.isArray(p)||p.length<1||p.length>4||new Set(p).size!==p.length||p.some(id=>typeof id!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(id)))
            throw Error('共用武器硬件格式错误 '+w.id);
    }
}
