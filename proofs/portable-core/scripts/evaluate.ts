import * as fs from 'node:fs';
import * as path from 'node:path';
import { freezeOracle, scoreCode, type Frozen } from '../evaluation/oracle.js';
import { report, type Cell, type RunRecord } from '../evaluation/report.js';
import { validateBatch } from '../core/budget.js';
import { text, object } from '../core/contracts.js';
import type { SourceCatalog } from '../evaluation/oracle.js';
const [command,...args]=process.argv.slice(2);
const read=(file:unknown):unknown=>JSON.parse(fs.readFileSync(text(file),'utf8'));
try{
 if(command==='freeze')console.log(JSON.stringify(freezeOracle(path.join(text(process.env.PROOF_SOURCE),'evaluation/oracles'),text(args[0])),null,2));
 else if(command==='score')console.log(JSON.stringify(scoreCode(text(args[0]),object(read(args[1])) as Frozen),null,2));
 else if(command==='report'){
  const batch=validateBatch(read(args[0]));const records=read(args[1]),runs=read(args[2]);if(!Array.isArray(records)||!Array.isArray(runs))throw new Error('records/runs must be arrays');
  console.log(JSON.stringify(report(batch,records as Cell[],runs as RunRecord[],object(read(args[3])) as SourceCatalog),null,2));
 }else throw new Error('commands: freeze TRUSTED_DIRECTORY | score FIXTURE FROZEN_MANIFEST | report BATCH CELLS RUN_BUNDLES TRUSTED_SOURCES');
}catch(e){console.error((e as Error).message);process.exitCode=1;}
