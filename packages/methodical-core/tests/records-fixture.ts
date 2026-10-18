import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {execFileSync} from 'node:child_process';
export function fixture() {
  const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'methodical-project-')));
  const git=(...args:string[])=>execFileSync('git',['--no-optional-locks','-C',root,...args],{stdio:'pipe'});
  git('init','-q','-b','main');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
  // Purity checks walk all of .git; fixture commits must not start asynchronous maintenance.
  git('config','maintenance.auto','false');git('config','gc.auto','0');
  fs.mkdirSync(path.join(root,'plans'));fs.writeFileSync(path.join(root,'plans/active.md'),'approved unit\n');
  fs.writeFileSync(path.join(root,'rulings.md'),'Keep exact bytes.\n');fs.writeFileSync(path.join(root,'app.txt'),'baseline\n');
  fs.writeFileSync(path.join(root,'.gitignore'),'.methodical/\n.private/\n');git('add','.');git('commit','-qm','baseline');
  return {root,git,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
