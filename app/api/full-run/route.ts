import { after } from "next/server";
import { experimental_evaluate as evaluate, generateText } from "ai";
import fs from "node:fs";
import path from "node:path";

export const dynamic="force-dynamic";
export const maxDuration=300;

type Meme={postLink?:string;subreddit?:string;title?:string;url?:string;author?:string;ups?:number;visual?:string;originalIndex?:number};

const criteria=[
  "One of the weakest candidates in this comparison set",
  "Very weak relative to this set",
  "Weak relative to this set",
  "Below average relative to this set",
  "Around average relative to this set",
  "Above average relative to this set",
  "Strong relative to this set",
  "Very strong relative to this set",
  "Top-tier relative to this set",
  "One of the very best candidates in this set",
] as const;

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

function snapshot():Meme[]{
  const p=path.join(process.cwd(),"data","live-500.json");
  const j=JSON.parse(fs.readFileSync(p,"utf8"));
  return Array.isArray(j?.items)?j.items:[];
}

async function withRetry<T>(fn:()=>Promise<T>,label:string):Promise<T>{
  let last:any;
  for(let i=0;i<6;i++){
    try{return await fn();}
    catch(e:any){
      last=e;
      console.log("RETRY",label,i+1,String(e?.message||e).slice(0,240));
      if(i<5)await sleep(800*Math.pow(1.6,i));
    }
  }
  throw last;
}

async function vision(items:Meme[],globalStart:number){
  const content:any[]=[{
    type:"text",
    text:"Analyze ALL meme images. For EACH image, read visible meme text/OCR, describe what is visually happening, and explain the joke/idea. Return EXACTLY one line per image as NUMBER|DESCRIPTION. NUMBER must be the given global index. Keep each description under 55 words. Do not skip any."
  }];
  items.forEach((m,i)=>{
    const idx=globalStart+i;
    content.push({type:"text",text:`IMAGE ${idx}: Reddit title: ${m.title||""}`});
    content.push({type:"file",mediaType:"image",data:new URL(String(m.url))});
  });
  const result=await withRetry(()=>generateText({
    model:"inclusionai/ling-3.0-flash-vl-free",
    maxOutputTokens:4000,
    messages:[{role:"user",content}],
  }),`vision-${globalStart}`);
  const map=new Map<number,string>();
  for(const line of result.text.split("\n")){
    const m=line.match(/^\s*(?:[-*]\s*)?(?:IMAGE\s*)?(\d+)\s*(?:\||:|[-–—])\s*(.+)$/i);
    if(m)map.set(Number(m[1]),m[2].trim());
  }
  return map;
}

async function jevRank(items:Meme[],label:string){
  const state=items.map((m,i)=>({
    index:i,title:m.title||"",subreddit:m.subreddit||"",upvotes:Number(m.ups||0),visual:m.visual||""
  }));
  const questions:Record<string,any>={};
  for(let i=0;i<items.length;i++){
    questions["m"+i]={
      type:"score",
      instructions:`Rank meme at state index ${i} RELATIVE to all other memes in this same set. Base the judgment primarily on actual visual description and visible meme text. Judge broad viral potential: instant comprehension, humor/emotional payoff, relatability, shareability, memorability and originality. Upvotes are supporting evidence only. A 9 means one of the very best in the comparison set; 0 one of the weakest.`,
      criteria,
    };
  }
  const result:any=await withRetry(()=>evaluate({
    model:"typesafe-ai/jev",state,questions,maxRetries:2
  }),`jev-${label}`);
  const conf=result.providerMetadata?.typesafe?.confidence||{};
  return items.map((m,i)=>({
    item:m,score:Number(result.answers?.["m"+i]?.score||0),confidence:Number(conf["m"+i]||0)
  })).sort((a,b)=>b.score-a.score||b.confidence-a.confidence);
}

async function run(runId:string){
  try{
    const all=snapshot().map((m,i)=>({...m,originalIndex:i}));
    if(all.length!==500)throw new Error(`snapshot count ${all.length}`);
    console.log("RUN_PROGRESS",runId,"snapshot",all.length);

    const semis:Meme[]=[];
    for(let g=0;g<5;g++){
      const start=g*100;
      const group=all.slice(start,start+100).map(x=>({...x}));
      for(let j=0;j<100;j+=20){
        const batch=group.slice(j,j+20);
        const map=await vision(batch,start+j);
        batch.forEach((m,k)=>{m.visual=map.get(start+j+k)||"";});
        console.log("RUN_PROGRESS",runId,`group${g}-vision`,j+20,"missing",batch.filter(x=>!x.visual).length);
        await sleep(250);
      }
      const missing=group.filter(x=>!x.visual).length;
      const ranked=await jevRank(group,`group-${g}`);
      semis.push(...ranked.slice(0,20).map(x=>x.item));
      console.log("RUN_PROGRESS",runId,`group${g}-ranked`,"missing",missing,"semis",semis.length);
      await sleep(650);
    }

    const final=await jevRank(semis,"final");
    const top=final.slice(0,20).map((x,i)=>({
      rank:i+1,
      originalIndex:x.item.originalIndex,
      title:x.item.title,
      subreddit:x.item.subreddit,
      upvotes:x.item.ups,
      image:x.item.url,
      post:x.item.postLink,
      visual:x.item.visual||""
    }));
    console.log("RUN_DONE",runId,"top20",top.length);
    for(const item of top){
      const enc=Buffer.from(JSON.stringify(item),"utf8").toString("base64");
      console.log("FINAL_ITEM",runId,item.rank,enc);
    }
  }catch(e:any){
    console.error("RUN_ERROR",runId,String(e?.message||e),String(e?.stack||"").slice(0,1200));
  }
}

export async function GET(){
  const runId="r"+Date.now();
  after(()=>run(runId));
  return Response.json({started:true,runId,snapshot:500});
}
