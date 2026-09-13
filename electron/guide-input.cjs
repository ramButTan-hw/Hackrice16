const {execFile,spawn}=require('node:child_process');
const {promisify}=require('node:util');
const {mkdir,readFile}=require('node:fs/promises');
const {existsSync}=require('node:fs');
const {createHash}=require('node:crypto');
const path=require('node:path');
exports.createInput=function(app){
 let binary,preparing,child;
 async function prepare(){
  if(process.platform!=='darwin')throw new Error('Supervised input is currently available on macOS. You can still follow the guide yourself.');
  if(binary)return binary;
  if(!preparing)preparing=(async()=>{
   const source=path.join(__dirname,'native','guide-input.swift');
   const hash=createHash('sha256').update(await readFile(source)).digest('hex').slice(0,12);
   const dir=path.join(app.getPath('userData'),'guide-helper');await mkdir(dir,{recursive:true});
   const target=path.join(dir,'input-'+hash);
   if(!existsSync(target))await promisify(execFile)('/usr/bin/xcrun',['swiftc','-module-cache-path',path.join(dir,'module-cache'),source,'-o',target],{timeout:60000,maxBuffer:1024*1024}).catch(()=>{throw new Error('Install Apple Command Line Tools (xcode-select --install) to enable supervised input. Guidance still works without it.');});
   binary=target;return target;
  })().finally(()=>{preparing=null;});
  return preparing;
 }
 async function run(body,signal){
  const target=await prepare();if(signal?.aborted)throw new Error('Guidance stopped.');
  return new Promise((resolve,reject)=>{
   const process=spawn(target,[],{stdio:['pipe','pipe','pipe'],signal});child=process;let output='';
   const timeout=setTimeout(()=>process.kill(),body.action==='locate_word'?15000:4000);
   process.stdout.on('data',data=>output+=data);process.stderr.resume();
   process.once('error',reject);
   process.once('close',()=>{clearTimeout(timeout);if(child===process)child=null;try{const value=JSON.parse(output);if(value.error)reject(new Error(value.error));else resolve(value);}catch{reject(new Error('Desktop action stopped or unavailable.'));}});
   process.stdin.on('error',()=>{});process.stdin.end(JSON.stringify(body));
  });
 }
 return {run,stop:()=>child?.kill()};
};
