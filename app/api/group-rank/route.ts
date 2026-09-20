import { experimental_evaluate as evaluate } from "ai";
import fs from "node:fs";
import path from "node:path";

export const dynamic="force-dynamic";
export const maxDuration=60;

type Meme={postLink?:string;subreddit?:string;title?:string;url?:string;author?:string;ups?:number;visual?:string};

const criteria=[
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

function loadSnapshot():Meme[]{
  const p=path.join(process.cwd(),"data","live-500.json");
  const j=JSON.parse(fs.readFileSync(p,"utf8"));
  return Array.isArray(j?.items)?j.items:[];
}

async function loadVision(group:number){
  const url=`https://raw.githubusercontent.com/ten1987/jev-meme-radar/main/data/vision-group-${group}.json?t=${Date.now()}`;
  const r=await fetch(url,{cache:"no-store"});
  if(!r.ok)throw new Error("vision group missing");
  const j:any=await r.json();
  return Array.isArray(j?.items)?j.items:[];
}

async function doRank(items:Meme[]){
  const state=items.map((m,i)=>({index:i,title:m.title||"",subreddit:m.subreddit||"",upvotes:Number(m.ups||0),visual:m.visual||""}));
  const questions:Record<string,any>={};
  for(let i=0;i<items.length;i++){
    questions["m"+i]={
      type:"score",
      instructions:`Rank meme at state index ${i} RELATIVE to the other memes in this same 100-item set. Base the judgment primarily on the actual visual description and visible meme text. Judge broad viral potential: immediate comprehension, humor/emotional payoff, relatability, shareability, memorability and originality. Upvotes are supporting evidence only. A 9 means one of the very best in this set; 0 one of the weakest.`,
      criteria,
    };
  }
  let last:any;
  for(let attempt=0;attempt<5;attempt++){
    try{return await evaluate({model:"typesafe-ai/jev",state,questions,maxRetries:2});}
    catch(e:any){last=e;await new Promise(r=>setTimeout(r,700*(attempt+1)));}
  }
  throw last;
}

export async function GET(req:Request){
  const group=Math.min(4,Math.max(0,Number(new URL(req.url).searchParams.get("group")||0)));
  const all=loadSnapshot();
  const vision=await loadVision(group);
  if(all.length!==500||vision.length!==100)return Response.json({error:"data",snapshot:all.length,vision:vision.length},{status:500});
  const start=group*100;
  const items=all.slice(start,start+100).map((m,i)=>({...m,visual:vision[i]?.visual||""}));
  const result:any=await doRank(items);
  const conf=result.providerMetadata?.typesafe?.confidence||{};
  const ranked=items.map((m,i)=>({
    originalIndex:start+i,title:m.title,subreddit:m.subreddit,upvotes:m.ups,image:m.url,post:m.postLink,visual:m.visual,
    score:Number(result.answers?.["m"+i]?.score||0),confidence:Number(conf["m"+i]||0)
  })).sort((a,b)=>b.score-a.score||b.confidence-a.confidence);
  return Response.json({group,evaluated:100,missingVisual:items.filter(x=>!x.visual).length,top20:ranked.slice(0,20)});
}
