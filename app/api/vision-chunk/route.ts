import { generateText } from "ai";
import fs from "node:fs";
import path from "node:path";

export const dynamic="force-dynamic";
export const maxDuration=60;

type Meme={postLink?:string;subreddit?:string;title?:string;url?:string;author?:string;ups?:number};

function load():Meme[]{
  const p=path.join(process.cwd(),"data","live-500.json");
  const j=JSON.parse(fs.readFileSync(p,"utf8"));
  return Array.isArray(j?.items)?j.items:[];
}

export async function GET(req:Request){
  const q=new URL(req.url).searchParams;
  const chunk=Math.min(24,Math.max(0,Number(q.get("chunk")||0)));
  const all=load();
  if(all.length!==500)return Response.json({error:"snapshot",count:all.length},{status:500});
  const start=chunk*20;
  const items=all.slice(start,start+20);

  const content:any[]=[{
    type:"text",
    text:"Analyze all 20 meme images. For EACH image, read visible meme text/OCR, describe what is visually happening, and explain the joke/idea. Return EXACTLY one line per image in this exact format NUMBER|DESCRIPTION, where NUMBER is the given global index. Keep each description under 55 words. Do not skip any."
  }];
  items.forEach((m,i)=>{
    const idx=start+i;
    content.push({type:"text",text:`IMAGE ${idx}: Reddit title: ${m.title||""}`});
    content.push({type:"file",mediaType:"image",data:new URL(String(m.url))});
  });

  const result=await generateText({
    model:"inclusionai/ling-3.0-flash-vl-free",
    maxOutputTokens:4000,
    messages:[{role:"user",content}],
  });

  const map=new Map<number,string>();
  for(const line of result.text.split("\n")){
    const m=line.match(/^\s*(?:[-*]\s*)?(?:IMAGE\s*)?(\d+)\s*(?:\||:|[-–—])\s*(.+)$/i);
    if(m)map.set(Number(m[1]),m[2].trim());
  }
  const out=items.map((m,i)=>({
    originalIndex:start+i,
    title:m.title,subreddit:m.subreddit,upvotes:m.ups,image:m.url,post:m.postLink,
    visual:map.get(start+i)||""
  }));
  return Response.json({chunk,start,count:out.length,missingVisual:out.filter(x=>!x.visual).length,items:out});
}
