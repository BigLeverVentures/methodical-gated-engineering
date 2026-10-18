import { GuardSession, type Connection } from '../guard/operator.js';
import * as fs from 'node:fs';
import { validateBatch, readyForOperator, type Capability } from '../core/budget.js';
import { object, text } from '../core/contracts.js';
import type { SourceCatalog } from '../evaluation/oracle.js';
const read=(p:unknown):unknown=>JSON.parse(fs.readFileSync(text(p),'utf8'));
try{
 const [manifest,grant,capabilities,sources,connection]=process.argv.slice(2);
 const batch=validateBatch(read(manifest));
 const c=read(capabilities);if(!Array.isArray(c))throw new Error('capabilities must be an array');
 const runtime=await GuardSession.connect(read(connection) as Connection);
 const result=readyForOperator(batch,read(grant),c as Capability[],object(read(sources)) as SourceCatalog,runtime);
 console.log(JSON.stringify({mode:'operator-protocol-only',...result},null,2));
 // Intentionally no child process, model API, installation, or automatic native session.
}catch(e){console.error('Live gate closed: '+(e as Error).message);process.exitCode=2;}
