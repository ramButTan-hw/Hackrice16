/* Local-only worker. No camera frames leave the device through this detector. */
importScripts('/attention-runtime/vision_bundle.js');
let face,objects,frameCount=0,phone=false,phoneAt=0;
onmessage=async({data})=>{
  try{
    if(data.init){
      const files=await Vision.FilesetResolver.forVisionTasks('/attention-runtime/wasm');
      face=await Vision.FaceLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:'/attention-runtime/face.task',delegate:'CPU'},runningMode:'VIDEO',numFaces:1,outputFacialTransformationMatrixes:true,minFaceDetectionConfidence:.7,minFacePresenceConfidence:.7,minTrackingConfidence:.7});
      objects=await Vision.ObjectDetector.createFromOptions(files,{baseOptions:{modelAssetPath:'/attention-runtime/objects.tflite',delegate:'CPU'},runningMode:'VIDEO',scoreThreshold:.65,categoryAllowlist:['cell phone'],maxResults:2});
      postMessage({ready:true});return;
    }
    const {bitmap,time}=data;if(!bitmap)return;
    try{
      const result=face.detectForVideo(bitmap,time);const points=result.faceLandmarks?.[0];
      if(frameCount++%3===0){phone=objects.detectForVideo(bitmap,time).detections.some(d=>d.categories.some(c=>c.categoryName==='cell phone'&&c.score>=.65));phoneAt=time;}
      let pose=null;
      if(points){const left=points[33],right=points[263],nose=points[1];const dx=right.x-left.x,dy=right.y-left.y,scale=dx*dx+dy*dy;
        if(scale>.0016&&scale<.25)pose={x:((nose.x-(left.x+right.x)/2)*dx+(nose.y-(left.y+right.y)/2)*dy)/scale,y:((nose.y-(left.y+right.y)/2)*dx-(nose.x-(left.x+right.x)/2)*dy)/scale};
      }
      postMessage({pose,matrix:result.facialTransformationMatrixes?.[0]?.data??null,phone:phone&&time-phoneAt<7000});
    }finally{bitmap.close();}
  }catch(error){postMessage({error:'Attention detector unavailable. Run npm run setup:attention and restart. '+error.message});}
};
