import {mkdir,copyFile,readdir,writeFile,access} from 'node:fs/promises';
const target=new URL('../public/attention-runtime/',import.meta.url);
await mkdir(new URL('wasm/',target),{recursive:true});
const source=new URL('../node_modules/@mediapipe/tasks-vision/',import.meta.url);
await copyFile(new URL('vision_bundle.js',source),new URL('vision_bundle.js',target));
for(const file of await readdir(new URL('wasm/',source)))await copyFile(new URL('wasm/'+file,source),new URL('wasm/'+file,target));
for(const [name,url]of Object.entries({
  'face.task':'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
  'objects.tflite':'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite'
})){
  try{await access(new URL(name,target));continue;}catch{}
  const response=await fetch(url,{signal:AbortSignal.timeout(120000)});if(!response.ok)throw new Error('Model download failed: '+response.status);
  await writeFile(new URL(name,target),Buffer.from(await response.arrayBuffer()));
}
console.log('Local attention models ready. Restart the app (or rebuild for npm start).');
