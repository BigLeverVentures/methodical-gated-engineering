import { assert, exact, object, text, hash } from './contracts.js';
// A proposed OS recipe and a signed mock receipt are not evidence of native isolation.
export const isolationChecks = ['native-bootstrap','descendant-egress','ipv6-dns-proxy','original-auth-keychain',
 'guard-secrets-ledger','signals-debugging','local-ipc-relays','unrestricted-spawn','automatic-compaction','cleanup'] as const;
export function setupProposal():{state:'not-provisioned';checks:readonly string[];liveBudgetUsd:0} {
 return {state:'not-provisioned',checks:isolationChecks,liveBudgetUsd:0};
}
export function validatePins(value:unknown):{publicKey:string;codeHash:string;manifestHash:string;ledgerId:string} {
 const v=object(value);exact(v,['publicKey','codeHash','manifestHash','ledgerId']);
 const publicKey=text(v.publicKey);assert(publicKey.includes('PUBLIC KEY'),'public key required');
 return {publicKey,codeHash:hash(v.codeHash),manifestHash:hash(v.manifestHash),ledgerId:text(v.ledgerId)};
}
