import {fail} from '../shared/contracts.js';
export async function generateImage(prompt,{fetcher=fetch,apiKey=process.env.GEMINI_IMAGE_API_KEY||process.env.GEMINI_API_KEY,signal,aspectRatio='1:1',model=process.env.GEMINI_IMAGE_MODEL||'gemini-2.5-flash-image'}={}){
  if(typeof prompt!=='string'||!prompt.trim()||prompt.length>3000)fail('Describe the image in 1 to 3000 characters.');
  if(!['1:1','16:9','9:16','4:3','3:4'].includes(aspectRatio))fail('Unsupported image aspect ratio.');
  if(!apiKey)fail('Configure GEMINI_IMAGE_API_KEY for image generation.',503);
  if(!/^[\w.-]+$/.test(model))fail('Invalid image model.',503);
  let response;try{response=await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(60000)]):AbortSignal.timeout(60000),body:JSON.stringify({contents:[{parts:[{text:'Generate one high-quality image following the requested subject, style, colors and composition. Do not add captions, watermarks or unrelated elements. Request: '+prompt}]}],generationConfig:{responseModalities:['TEXT','IMAGE'],imageConfig:{aspectRatio}}})});}catch{fail('Image generation timed out or could not connect. Please retry explicitly.',504);}
  if(!response.ok){await response.body?.cancel();fail(response.status===429?'Image generation quota reached. Check image-model billing/quota or try later.':`Image generation failed (HTTP ${response.status}). Check GEMINI_IMAGE_MODEL and image-model access.`,502);}
  const data=await response.json();const image=data.candidates?.[0]?.content?.parts?.find(p=>p.inlineData&&!p.thought)?.inlineData;
  if(!image||!['image/png','image/jpeg'].includes(image.mimeType)||!image.data||image.data.length>14000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(image.data))fail('The image model returned no usable image. Try a different illustration prompt.',502);
  const bytes=Buffer.from(image.data,'base64');
  const valid=image.mimeType==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(!valid)fail('The image model returned invalid image bytes.',502);
  return `data:${image.mimeType};base64,${image.data}`;
}

