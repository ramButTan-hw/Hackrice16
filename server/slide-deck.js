import pptxgen from 'pptxgenjs';
import {generateImage} from './image-generation.js';

export function generateSlideImage(prompt,options={}){
  return generateImage('A polished editorial illustration for a study presentation. Clear focal point, dark forest green and warm ivory palette with restrained gold accents. No text, labels, watermarks, or invented charts. Conceptual illustration, not scientific evidence. Subject: '+prompt,{...options,aspectRatio:'16:9'});
}

export async function buildSlideDeck(draft,images={}){
  const pptx=new pptxgen();pptx.layout='LAYOUT_WIDE';pptx.author='Acumen';pptx.title=draft.title;pptx.subject='Study presentation';pptx.lang='en-US';
  const palette={green:['182C25','F4F1E7','E2E8D9','C5D3A8','A7BAA8'],blue:['12243D','F0F6FF','D5E4F5','7DC5ED','9BBAD4'],ivory:['F5F1E8','21372C','35493E','70854B','61715E']}[draft.theme||'green'];
  draft.slides.forEach((item,index)=>{
    const slide=pptx.addSlide();slide.background={color:palette[0]};
    slide.addShape(pptx.ShapeType.rect,{x:.55,y:.55,w:.65,h:.06,line:{color:palette[3]},fill:{color:palette[3]}});
    slide.addText(item.title,{x:.55,y:.85,w:12.1,h:.95,fontFace:'Aptos Display',fontSize:30,bold:true,color:palette[1],margin:0,breakLine:false,fit:'shrink'});
    const image=images[index];
    slide.addText(item.bullets.map(text=>({text,options:{bullet:{indent:18},breakLine:true}})),{x:.65,y:2,w:image?5.6:11.8,h:4.3,fontFace:'Aptos',fontSize:22,color:palette[2],paraSpaceAfterPt:18,margin:0,fit:'shrink',valign:'top'});
    if(image)slide.addImage({data:image,x:6.7,y:2.1,w:6,h:3.8,sizing:{type:'contain',w:6,h:3.8},altText:item.imagePrompt||item.title});
    slide.addText(`${draft.title}  ·  ${index+1} / ${draft.slides.length}${image?'  ·  AI illustration':''}`,{x:.65,y:7,w:12,h:.2,fontSize:10,color:palette[4],margin:0});
  });
  return pptx.write({outputType:'nodebuffer'});
}

export function presentationUpload(title,id,bytes){
  const boundary='jarvis_'+id.replaceAll('-','');
  const metadata={name:title,mimeType:'application/vnd.google-apps.presentation',appProperties:{jarvisActionId:id}};
  return {body:Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.presentationml.presentation\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--\r\n`)]),headers:{'Content-Type':`multipart/related; boundary=${boundary}`}};
}
