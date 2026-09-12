import {memoryService} from '../server/memory.js';
import {generateReply} from '../server/chat.js';
process.loadEnvFile('.env');
const memory=memoryService();const ids=[];const tag='study-probe-'+Date.now();
const sessions={get:async()=>({goal:tag,source:'demo'}),state:async()=>({})};
const tracked={configured:true,search:memory.search,save:async(...args)=>{const r=await memory.save(...args);ids.push(r.memory_id??r.id);return r;}};
try{
  await generateReply({sessionId:'probe-first',messages:[{role:'user',text:'For '+tag+', remember that I prefer a single hint before a full answer.'}]},{sessions,memory:tracked,onText:()=>{}});
  const result=await generateReply({sessionId:'probe-second',messages:[{role:'user',text:'For '+tag+', what help style did I ask for previously?'}]},{sessions,memory:tracked,onText:()=>{}});
  console.log(JSON.stringify({recalled:result.recalled,text:result.text}));
  if(!result.recalled||!/hint/i.test(result.text))throw new Error('Cross-session recall failed');
}finally{for(const id of ids)if(id)await memory.remove(id,'demo');}
