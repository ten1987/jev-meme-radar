import { experimental_evaluate as evaluate } from "ai";

export const dynamic="force-dynamic";
export const maxDuration=60;

const criteria=[
  "One of the weakest semifinalists",
  "Very weak among semifinalists",
  "Weak among semifinalists",
  "Below average among semifinalists",
  "Around average among semifinalists",
  "Above average among semifinalists",
  "Strong semifinalist",
  "Very strong semifinalist",
  "Top-tier semifinalist",
  "One of the very best memes in the entire 500-item benchmark",
] as const;

async function loadSemis(){
  const url=`https://raw.githubusercontent.com/ten1987/jev-meme-radar/main/data/semifinalists.json?t=${Date.now()}`;
  const r=await fetch(url,{cache:"no-store"});
  if(!r.ok)throw new Error("semifinalists missing");
  const j:any=await r.json();
  return Array.isArray(j?.items)?j.items:[];
}

export async function GET(){
  const items:any[]=await loadSemis();
  if(items.length!==100)return Response.json({error:"Need exactly 100 semifinalists",count:items.length},{status:500});
  const state=items.map((m,i)=>({
    index:i,title:m.title||"",subreddit:m.subreddit||"",upvotes:Number(m.upvotes||0),visual:m.visual||""
  }));
  const questions:Record<string,any>={};
  for(let i=0;i<items.length;i++){
    questions["m"+i]={
      type:"score",
      instructions:`Final tournament: rank meme at state index ${i} RELATIVE to all 99 other semifinalists. Use the actual visual description and visible meme text. Judge broad viral potential: instant comprehension, humor/emotional payoff, relatability, shareability, memorability and originality. Upvotes are evidence only. A 9 means among the very best of the entire original 500-meme benchmark.`,
      criteria,
    };
  }
  let result:any,last:any;
  for(let attempt=0;attempt<5;attempt++){
    try{result=await evaluate({model:"typesafe-ai/jev",state,questions,maxRetries:2});break;}
    catch(e:any){last=e;await new Promise(r=>setTimeout(r,800*(attempt+1)));}
  }
  if(!result)throw last;
  const conf=result.providerMetadata?.typesafe?.confidence||{};
  const ranked=items.map((m,i)=>({...m,
    _score:Number(result.answers?.["m"+i]?.score||0),
    _confidence:Number(conf["m"+i]||0)
  })).sort((a,b)=>b._score-a._score||b._confidence-a._confidence);
  return Response.json({
    evaluated:100,
    top20:ranked.slice(0,20).map((m,idx)=>({
      rank:idx+1,originalIndex:m.originalIndex,title:m.title,subreddit:m.subreddit,upvotes:m.upvotes,
      image:m.image,post:m.post,visual:m.visual
    }))
  });
}
