const {spawn}=require('node:child_process');
const {existsSync}=require('node:fs');
const {resolve}=require('node:path');
const {createInterface}=require('node:readline');
const pythonPath=env=>env.WAKE_PYTHON||resolve(__dirname,'../data/wake-env',process.platform==='win32'?'Scripts/python.exe':'bin/python');
exports.wakeConfigured=env=>existsSync(pythonPath(env));
exports.createWakeWorker=function(env){
  let child,pending=null,ready=false,startTimer,startReject;
  function release(){ready=false;clearTimeout(startTimer);startReject?.(new Error('Wake detector stopped.'));startReject=null;const old=child;child=null;old?.kill();if(pending){pending.reject(new Error('Wake detector stopped.'));pending=null;}}
  return {release,
    start(){return new Promise((resolveStart,rejectStart)=>{
      child=spawn(pythonPath(env),[resolve(__dirname,'../scripts/wake-worker.py')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
      const proc=child;
      startReject=rejectStart;
      startTimer=setTimeout(()=>fail(new Error('Local wake model startup timed out.')),30000);
      function fail(error){clearTimeout(startTimer);rejectStart(error);release();}
      proc.on('error',()=>fail(new Error('Run the local wake setup, then restart the app.')));
      proc.on('exit',()=>{if(child===proc)fail(new Error('Local wake detector exited. Run setup again.'));});
      proc.stdin.on('error',()=>fail(new Error('Local wake audio pipe closed.')));
      proc.stderr.resume();
      createInterface({input:proc.stdout}).on('line',line=>{
        try{const value=JSON.parse(line);
          if(value.error){fail(new Error('Local wake detector: '+value.error));return;}
          if(value.ready){ready=true;clearTimeout(startTimer);startReject=null;resolveStart({sampleRate:16000,frameLength:1280});return;}
          const request=pending;pending=null;request?.resolve(Boolean(value.detected));
        }catch{fail(new Error('Invalid local wake response.'));}
      });
    });},
    process(data){if(!ready)return Promise.resolve(false);if(pending)return Promise.resolve(false);
      return new Promise((resolveResult,reject)=>{const timer=setTimeout(()=>release(),5000);pending={resolve:value=>{clearTimeout(timer);resolveResult(value);},reject:error=>{clearTimeout(timer);reject(error);}};child.stdin.write(JSON.stringify({audio:Buffer.from(data.buffer,data.byteOffset,data.byteLength).toString('base64')})+'\n');});}
  };
};
