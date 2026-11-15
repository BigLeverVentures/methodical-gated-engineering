/** Source guidance, native qualification and legacy options remain separately attributable. */
import * as fs from 'node:fs';
import { profile, type Profile, type Choice, type Host, type Role, type Setting } from './contracts.js';
export function loadProfile(file: string): Profile { return profile(JSON.parse(fs.readFileSync(file, 'utf8'))); }
export function resolveProfile(raw: unknown, options: {
    qualifiedOverrides?: Profile['qualifiedOverrides'];
    legacyRoleModels?: Profile['legacyRoleModels'];
} = {}): Profile {
    const p = profile(raw);
    return profile({ ...p, qualifiedOverrides: options.qualifiedOverrides === undefined ? p.qualifiedOverrides : options.qualifiedOverrides, legacyRoleModels: options.legacyRoleModels === undefined ? p.legacyRoleModels : options.legacyRoleModels });
}
/** Explicit legacy role model wins for that role; effort remains independently resolved. */
export function choiceSetting(p: Profile, name: Choice, forRole: Role): Setting {
    const selected = p.qualifiedOverrides?.choices[name] ?? p.choices[name], legacy = p.legacyRoleModels[forRole];
    return { ...selected, ...(legacy ? { model: legacy } : {}) };
}

/** Lead settings are a session choice, independent of the sealed worker profile. */
export function coordinatorSetting(platform: Host): Setting {
    return platform === 'claude-code' ? {model: 'fable', effort: 'medium'} : {model: 'gpt-6-astra', effort: 'medium'};
}
