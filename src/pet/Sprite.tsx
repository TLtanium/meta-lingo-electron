import { useEffect, useRef } from 'react'
import { CELL, animationCell, lookCell, type PetAnimation } from './atlas'

// Public assets are served from the app base in development and file:// builds.
export const bundledSpriteURL = `${import.meta.env.BASE_URL}pets/lemy.png`
export default function Sprite({animation,look,scale,reduced,canvasRef,onFrameTop,...props}:{
  animation:PetAnimation;look?:{x:number;y:number};scale:number;reduced:boolean;
  canvasRef:React.RefObject<HTMLCanvasElement>;onFrameTop?:(top:number)=>void
} & React.CanvasHTMLAttributes<HTMLCanvasElement>){
 const imageRef=useRef<HTMLImageElement>()
 useEffect(()=>{
  const image=new Image();image.src=bundledSpriteURL;imageRef.current=image
  return ()=>{imageRef.current=undefined}
 },[])
 useEffect(()=>{
  const start=performance.now();let raf=0,previous='',last=0
  const paint=(now:number)=>{
   raf=requestAnimationFrame(paint)
   if(now-last<40)return;last=now
   const canvas=canvasRef.current,image=imageRef.current,ctx=canvas?.getContext('2d',{willReadFrequently:true})
   if(!canvas||!ctx||!image?.complete||!image.naturalWidth)return
   const cell=look&&!reduced?lookCell(look.x,look.y):animationCell(animation,now-start,reduced)
   const key=cell.row+':'+cell.column
   if(key===previous)return;previous=key
   ctx.clearRect(0,0,CELL.width,CELL.height)
   ctx.drawImage(image,cell.column*CELL.width,cell.row*CELL.height,CELL.width,CELL.height,0,0,CELL.width,CELL.height)
   if(onFrameTop){
    const pixels=ctx.getImageData(0,0,CELL.width,CELL.height).data
    let top=0
    outer:for(let y=0;y<CELL.height;y++)for(let x=0;x<CELL.width;x++)if(pixels[(y*CELL.width+x)*4+3]>24){top=y;break outer}
    onFrameTop(top)
   }
  }
  raf=requestAnimationFrame(paint)
  return ()=>cancelAnimationFrame(raf)
 },[animation,look?.x,look?.y,reduced,canvasRef,onFrameTop])
 return <canvas {...props} ref={canvasRef} width={CELL.width} height={CELL.height} style={{width:144*scale,height:156*scale,...props.style}} />
}
