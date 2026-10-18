import * as fs from 'node:fs';
import * as path from 'node:path';
import {description,experiment} from './supervisor.js';
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--describe')process.stdout.write(JSON.stringify(description())+'\n');
else if(args.length===3&&args[0]==='--preflight'&&args[1]&&args[2]){
  const source=process.env.PROOF_SOURCE;if(!source)throw new Error('proof source required');
  const abort=new AbortController();const cancel=()=>abort.abort();
  process.on('SIGINT',cancel);process.on('SIGTERM',cancel);
  try{
    const result=await experiment(path.resolve(source,'../..'),source,JSON.parse(fs.readFileSync(args[1],'utf8')),args[2],abort.signal);
    process.stdout.write(JSON.stringify(result)+'\n');process.exitCode=abort.signal.aborted?130:2;
  }finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
}else{process.stderr.write('Use --describe or --preflight FROZEN_MANIFEST EXCLUSIVE_PRIVATE_OUTPUT. Native launch is unavailable.\n');process.exitCode=2;}
