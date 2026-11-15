/** Source guidance, native qualification and legacy options remain separately attributable. */
import * as fs from 'node:fs';
import { profile } from './contracts.js';
export function loadProfile(file) { return profile(JSON.parse(fs.readFileSync(file, 'utf8'))); }
export function resolveProfile(raw, options = {}) {
    const p = profile(raw);
    return profile({ ...p, qualifiedOverrides: options.qualifiedOverrides === undefined ? p.qualifiedOverrides : options.qualifiedOverrides, legacyRoleModels: options.legacyRoleModels === undefined ? p.legacyRoleModels : options.legacyRoleModels });
}
/** Explicit legacy role model wins for that role; effort remains independently resolved. */
export function choiceSetting(p, name, forRole) {
    const selected = p.qualifiedOverrides?.choices[name] ?? p.choices[name], legacy = p.legacyRoleModels[forRole];
    return { ...selected, ...(legacy ? { model: legacy } : {}) };
}
/** Lead settings are a session choice, independent of the sealed worker profile. */
export function coordinatorSetting(platform) {
    return platform === 'claude-code' ? { model: 'fable', effort: 'high' } : { model: 'gpt-6-astra', effort: 'medium' };
}
