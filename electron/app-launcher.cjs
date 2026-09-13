const {readdir}=require('node:fs/promises');
const path=require('node:path');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const aliases={chrome:'google chrome',vscode:'visual studio code','vs code':'visual studio code',word:'microsoft word',excel:'microsoft excel',powerpoint:'microsoft powerpoint',settings:'system settings'};
exports.createAppLauncher=function({home,platform=process.platform,readDirectory=readdir,run=promisify(execFile)}){
 return async function launch(value){
  const {appName}=await import('../shared/app-request.js');const name=appName(value);
  if(platform!=='darwin')throw new Error('Installed app launching is currently available on macOS.');
  const normalized=name.toLowerCase(),wanted=aliases[normalized]||normalized;
  const roots=['/Applications','/System/Applications',path.join(home,'Applications')];
  const found=[];
  async function scan(root,depth=0){
   const entries=await readDirectory(root,{withFileTypes:true}).catch(()=>[]);
   for(const item of entries){
    if(item.name.toLowerCase().endsWith('.app')){
     if(item.name.slice(0,-4).toLowerCase()===wanted)found.push(path.join(root,item.name));
    }else if(item.isDirectory()&&depth<1)await scan(path.join(root,item.name),depth+1);
   }
  }
  await Promise.all(roots.map(root=>scan(root)));
  if(wanted==='finder')found.push('/System/Library/CoreServices/Finder.app');
  if(!found.length)throw new Error(`I couldn’t find “${name}” in Applications. Use its installed app name.`);
  // Launch only a discovered bundle; never interpolate names into a shell command.
  const target=found.sort()[0];
  await run('/usr/bin/open',['-a',target],{timeout:10000}).catch(()=>{throw new Error(`Could not open ${name}. Try opening it from Applications.`);});
  return {name:path.basename(target,'.app')};
 };
};
