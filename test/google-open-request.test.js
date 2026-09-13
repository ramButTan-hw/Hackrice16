import test from 'node:test';
import assert from 'node:assert/strict';
import {googleOpenRequest,savedGoogleResult} from '../src/google-open-request.js';
test('spoken Google-result requests are separate from ordinary website and app opening',()=>{
 for(const text of ['open in Google','Hey Jarvis, open it in Google.','can you open the document','open it','please open that in Google'])assert.equal(googleOpenRequest(text),true,text);
 for(const text of ['open Google','open google.com','open Safari',"don't open it in Google",'how do I open it in Google?'])assert.equal(googleOpenRequest(text),false,text);
});
test('opening chooses the latest saved result, never an unsaved or cancelled preview',()=>{
 const old={status:'done',result:{url:'https://docs.google.com/document/d/old/edit'}},latest={status:'done',result:{url:'https://docs.google.com/document/d/new/edit'}};
 assert.equal(savedGoogleResult([old,latest,{status:'preview'},{status:'cancelled',result:{url:'https://example.com'}}]),latest);
 assert.equal(savedGoogleResult([{status:'preview'}]),undefined);
});
