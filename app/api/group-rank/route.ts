import { experimental_evaluate as evaluate, generateText } from "ai";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Meme = {
  postLink?: string;
  subreddit?: string;
  title?: string;
  url?: string;
  author?: string;
  ups?: number;
  visual?: string;
};

const criteria = [
  "One of the weakest memes in this 100-item group",
  "Very weak relative to this group",
  "Weak relative to this group",
  "Below average relative to this group",
  "Around average relative to this group",
  "Above average relative to this group",
  "Strong relative to this group",
  "Very strong relative to this group",
  "Top-tier relative to this group",
  "One of the very best memes in this group",
] as const;

const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

function loadSnapshot(): Meme[] {
  const p=path.join(process.cwd(),"data","live-500.json");
  const j=JSON.parse(fs.readFileSync(p,"utf8"));
  return Array.isArray(j?.items) ? j.items : [];
}

async function visionBatch(items:Meme[], base:number) {
  const content:any[]=[{
    type:"text",
    text:"Analyze these meme images. For EACH image, read the visible meme text/OCR, state what is visually happening, and explain the joke/idea. Return exactly one line per image: NUMBER|DESCRIPTION. Keep each description under 55 words. Do not skip any image."
  }];
  items.forEach((m,i)=>{
    content.push({type:"text",text:`IMAGE ${base+i}: Reddit title: ${m.title||""}`});
    content.push({type:"file",mediaType:"image",data:new URL(String(m.url))});
  });

  const result=await generateText({
    model:"inclusionai/ling-3.0-flash-vl-free",
    maxOutputTokens:3500,
    messages:[{role:"user",content}],
  });

  const map=new Map<number,string>();
  for (const line of result.text.split("\n")) {
    const match=line.match(/^\s*(?:[-*]\s*)?(?:IMAGE\s*)?(\d+)\s*(?:\||:|[-–—])\s*(.+)$/i);
    if(match) map.set(Number(match[1]),match[2].trim());
  }
  return map;
}

async function rank(items:Meme[]) {
  const state=items.map((m,i)=>({
    index:i,
    title:m.title||"",
    subreddit:m.subreddit||"",
    upvotes:Number(m.ups||0),
    visual:m.visual||"",
  }));
  const questions:Record<string,any>={};
  for(let i=0;i<items.length;i++){
    questions["m"+i]={
      type:"score",
      instructions:`Rank meme at state index ${i} RELATIVE to the other 99 memes in this same set. Use the actual visual description and visible meme text, plus title and upvotes. Judge broad viral potential: immediate comprehension, humor/emotional payoff, relatability, shareability, memorability and originality. Upvotes are only supporting evidence, not the ranking itself. A 9 means one of the very best in this set and 0 one of the weakest.`,
      criteria,
    };
  }
  const result:any=await evaluate({
    model:"typesafe-ai/jev",
    state,
    questions,
    maxRetries:2,
  });
  const conf=result.providerMetadata?.typesafe?.confidence||{};
  return items.map((m,i)=>({
    item:m,
    score:Number(result.answers?.["m"+i]?.score||0),
    confidence:Number(conf["m"+i]||0),
  })).sort((a,b)=>b.score-a.score||b.confidence-a.confidence);
}

export async function GET(req:Request){
  const q=new URL(req.url).searchParams;
  const group=Math.min(4,Math.max(0,Number(q.get("group")||0)));
  const all=loadSnapshot();
  if(all.length!==500) return Response.json({error:"Snapshot must contain exactly 500",count:all.length},{status:500});
  const start=group*100;
  const items=all.slice(start,start+100).map(x=>({...x}));
  const started=Date.now();

  for(let i=0;i<items.length;i+=20){
    const batch=items.slice(i,i+20);
    let map:Map<number,string>|null=null;
    for(let attempt=0;attempt<3;attempt++){
      try { map=await visionBatch(batch,i); break; }
      catch(e){ if(attempt===2) throw e; await sleep(600*(attempt+1)); }
    }
    batch.forEach((m,j)=>{m.visual=map?.get(i+j)||"";});
    await sleep(150);
  }

  const missingVisual=items.filter(x=>!x.visual).length;
  const ranked=await rank(items);
  const top20=ranked.slice(0,20).map((x,rank)=>({
    rank:rank+1,
    originalIndex:start+items.indexOf(x.item),
    title:x.item.title,
    subreddit:x.item.subreddit,
    upvotes:x.item.ups,
    image:x.item.url,
    post:x.item.postLink,
    visual:x.item.visual,
    internalScore:x.score,
    confidence:x.confidence,
  }));
  return Response.json({group,start,evaluated:100,missingVisual,elapsedMs:Date.now()-started,top20});
}
