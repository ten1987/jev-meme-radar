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

function load500():Meme[]{
  const p=path.join(process.cwd(),"data","live-500.json");
  const j=JSON.parse(fs.readFileSync(p,"utf8"));
  return Array.isArray(j?.items)?j.items:[];
}

async function jevRank(items:Meme[],label:string,withVisual:boolean){
  const state=items.map((m,i)=>({
    index:i,title:m.title||"",subreddit:m.subreddit||"",upvotes:Number(m.ups||0),
    ...(withVisual?{visual:m.visual||""}:{})
  }));
  const questions:Record<string,any>={};
  for(let i=0;i<items.length;i++){
    questions["m"+i]={
      type:"score",
      instructions:withVisual
        ? `Rank meme at state index ${i} RELATIVE to all others in this set. Base the judgment primarily on the actual visual description and visible meme text, with Reddit title/subreddit/upvotes as supporting context. Judge broad viral potential: instant comprehension, humor/emotional payoff, relatability, shareability, memorability and originality. A 9 means one of the very best in this set.`
        : `Coarse screening only: rank meme at state index ${i} RELATIVE to all others in this set using Reddit title, subreddit and real upvotes. Select ideas likely worth visual review for broad viral meme potential. Upvotes are evidence, not the sole criterion. A 9 means one of the strongest candidates for visual review.`,
      criteria,
    };
  }
  let last:any;
  for(let attempt=0;attempt<6;attempt++){
    try{
      const result:any=await evaluate({model:"typesafe-ai/jev",state,questions,maxRetries:2});
      const conf=result.providerMetadata?.typesafe?.confidence||{};
      return items.map((m,i)=>({
        item:m,score:Number(result.answers?.["m"+i]?.score||0),confidence:Number(conf["m"+i]||0)
      })).sort((a,b)=>b.score-a.score||b.confidence-a.confidence);
    }catch(e:any){
      last=e;
      console.log("FAST_RETRY",label,attempt+1,String(e?.message||e).slice(0,220));
      await sleep(2500*(attempt+1));
    }
  }
  throw last;
}

async function vision50(items:Meme[],label:string){
  const content:any[]=[{
    type:"text",
    text:"Analyze ALL 50 meme images. For EACH image, read visible meme text/OCR, describe what is visually happening, and explain the joke/idea. Return EXACTLY one line per image as NUMBER|DESCRIPTION using the local IMAGE number 0-49. Keep each description under 45 words. Do not skip any."
  }];
  items.forEach((m,i)=>{
    content.push({type:"text",text:`IMAGE ${i}: Reddit title: ${m.title||""}`});
    content.push({type:"file",mediaType:"image",data:new URL(String(m.url))});
  });

  let last:any;
  for(let attempt=0;attempt<5;attempt++){
    try{
      const result=await generateText({
        model:"inclusionai/ling-3.0-flash-vl-free",
        maxOutputTokens:7000,
        messages:[{role:"user",content}],
      });
      const map=new Map<number,string>();
      for(const line of result.text.split("\n")){
        const x=line.match(/^\s*(?:[-*]\s*)?(?:IMAGE\s*)?(\d+)\s*(?:\||:|[-–—])\s*(.+)$/i);
        if(x)map.set(Number(x[1]),x[2].trim());
      }
      return items.map((m,i)=>({...m,visual:map.get(i)||""}));
    }catch(e:any){
      last=e;
      const msg=String(e?.message||e);
      console.log("FAST_RETRY",label,attempt+1,msg.slice(0,240));
      if(/rate limit|429|requests per minute/i.test(msg)) await sleep(65000);
      else await sleep(3000*(attempt+1));
    }
  }
  throw last;
}

async function run(runId:string){
  try{
    const all=load500().map((m,i)=>({...m,originalIndex:i}));
    if(all.length!==500)throw new Error("snapshot must be 500");
    console.log("FAST_PROGRESS",runId,"snapshot",500);

    const semis:Meme[]=[];
    for(let g=0;g<5;g++){
      const ranked=await jevRank(all.slice(g*100,g*100+100),`coarse-${g}`,false);
      semis.push(...ranked.slice(0,20).map(x=>x.item));
      console.log("FAST_PROGRESS",runId,"coarse",g+1,"semis",semis.length);
      await sleep(800);
    }

    console.log("FAST_PROGRESS",runId,"vision-start",semis.length);
    const [a,b]=await Promise.all([
      vision50(semis.slice(0,50),"vision-A"),
      vision50(semis.slice(50,100),"vision-B"),
    ]);
    const visualSemis=[...a,...b];
    console.log("FAST_PROGRESS",runId,"vision-done","missing",visualSemis.filter(x=>!x.visual).length);

    const final=await jevRank(visualSemis,"final",true);
    const top=final.slice(0,20).map((x,i)=>({
      rank:i+1,originalIndex:x.item.originalIndex,title:x.item.title,subreddit:x.item.subreddit,
      upvotes:x.item.ups,image:x.item.url,post:x.item.postLink,visual:x.item.visual||""
    }));
    console.log("FAST_DONE",runId,"top20",top.length);
    for(const item of top){
      console.log("FAST_ITEM",runId,item.rank,Buffer.from(JSON.stringify(item),"utf8").toString("base64"));
    }
  }catch(e:any){
    console.error("FAST_ERROR",runId,String(e?.message||e),String(e?.stack||"").slice(0,1200));
  }
}

export async function GET(){
  const runId="f"+Date.now();
  after(()=>run(runId));
  return Response.json({started:true,runId,snapshot:500,visionSemifinalists:100});
}
