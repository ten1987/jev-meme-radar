import { experimental_evaluate as evaluate } from "ai";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Meme = {
  postLink?: string;
  subreddit?: string;
  title?: string;
  url?: string;
  nsfw?: boolean;
  spoiler?: boolean;
  author?: string;
  ups?: number;
  preview?: string[];
  visual?: string;
};

const relativeCriteria = [
  "Bottom-tier candidate compared with the other memes in this set",
  "Very weak compared with this set",
  "Weak compared with this set",
  "Below average compared with this set",
  "Around average compared with this set",
  "Above average compared with this set",
  "Strong compared with this set",
  "Very strong compared with this set",
  "Top-tier compared with this set",
  "One of the very best candidates in this set",
] as const;

const sleep = (ms:number) => new Promise(r => setTimeout(r, ms));

async function fetchMemes(): Promise<Meme[]> {
  const subs = [
    "memes","dankmemes","me_irl","meirl","wholesomememes","AdviceAnimals",
    "starterpacks","comedyheaven","HistoryMemes","ProgrammerHumor","PrequelMemes","lotrmemes",
  ];
  const all:Meme[] = [];
  for (const sub of subs) {
    try {
      const r = await fetch(`https://meme-api.com/gimme/${sub}/50`, { cache:"no-store" });
      if (!r.ok) continue;
      const j:any = await r.json();
      for (const m of (Array.isArray(j?.memes) ? j.memes : [])) {
        if (m.nsfw || m.spoiler || !m.url || !m.postLink) continue;
        const clean = String(m.url).split("?")[0].toLowerCase();
        if (![".jpg",".jpeg",".png",".webp"].some(ext => clean.endsWith(ext))) continue;
        all.push(m);
      }
    } catch {}
  }
  const seen = new Set<string>();
  return all.filter(m => {
    const k = m.postLink || m.url || "";
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0,500);
}

async function jevRank(items:Meme[]) {
  const state = items.map((m,i) => ({
    index:i,
    title:m.title || "",
    subreddit:m.subreddit || "",
    upvotes:Number(m.ups || 0),
    visual:m.visual || "",
  }));
  const questions:Record<string,any> = {};
  for (let i=0;i<items.length;i++) {
    questions["m"+i] = {
      type:"score",
      instructions:`Rank meme at state index ${i} RELATIVE to all other memes in this SAME state. Judge broad viral potential: immediate comprehension, humor or emotional payoff, relatability, shareability, memorability and originality. Use visual description when present. Upvotes are evidence, not the answer: do not simply sort by upvotes and consider subreddit/niche effects. A 9 means one of the very best in this set; 0 means one of the weakest.`,
      criteria:relativeCriteria,
    };
  }
  const result:any = await evaluate({
    model:"typesafe-ai/jev",
    state,
    questions,
    maxRetries:2,
  });
  const conf = result.providerMetadata?.typesafe?.confidence || {};
  return items.map((m,i) => ({
    meme:m,
    score:Number(result.answers?.["m"+i]?.score || 0),
    confidence:Number(conf["m"+i] || 0),
  })).sort((a,b)=>b.score-a.score || b.confidence-a.confidence);
}

function extractOutputText(j:any) {
  if (typeof j?.output_text === "string") return j.output_text;
  const parts:string[] = [];
  for (const o of (j?.output || [])) {
    for (const c of (o?.content || [])) {
      if (typeof c?.text === "string") parts.push(c.text);
    }
  }
  return parts.join("\n");
}

async function visionBatch(items:Meme[]) {
  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!token) return items.map((m,i)=>({index:i,visual:""}));

  const content:any[] = [{
    type:"input_text",
    text:"You are inspecting meme images for a ranking system. For each numbered image, briefly state the visible meme text/OCR, what is visually happening, and the joke/idea if inferable. Return EXACTLY one line per image in format NUMBER|DESCRIPTION. Keep each description under 45 words."
  }];
  items.forEach((m,i)=>{
    content.push({type:"input_text", text:`IMAGE ${i}: title=${m.title || ""}`});
    content.push({type:"input_image", image_url:m.url, detail:"low"});
  });

  try {
    const r = await fetch("https://ai-gateway.vercel.sh/v1/responses", {
      method:"POST",
      headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
      body:JSON.stringify({
        model:"google/gemini-3.5-flash-lite",
        input:[{role:"user",content}],
        max_output_tokens:1800,
      }),
    });
    if (!r.ok) return items.map((m,i)=>({index:i,visual:""}));
    const j = await r.json();
    const text = extractOutputText(j);
    const map = new Map<number,string>();
    for (const line of text.split("\n")) {
      const match = line.match(/^\s*(\d+)\s*\|\s*(.+)$/);
      if (match) map.set(Number(match[1]), match[2].trim());
    }
    return items.map((m,i)=>({index:i,visual:map.get(i) || ""}));
  } catch {
    return items.map((m,i)=>({index:i,visual:""}));
  }
}

export async function GET() {
  const started = Date.now();
  const all = await fetchMemes();
  if (all.length < 100) {
    return Response.json({error:"Not enough live memes collected", collected:all.length},{status:502});
  }

  const groups:Meme[][] = [];
  for (let i=0;i<all.length;i+=100) groups.push(all.slice(i,i+100));

  const semifinalists:Meme[] = [];
  for (const group of groups) {
    const ranked = await jevRank(group);
    semifinalists.push(...ranked.slice(0,20).map(x=>x.meme));
    await sleep(650);
  }

  for (let i=0;i<semifinalists.length;i+=10) {
    const batch = semifinalists.slice(i,i+10);
    const seen = await visionBatch(batch);
    seen.forEach((v,j)=>{ batch[j].visual = v.visual; });
    await sleep(250);
  }

  await sleep(700);
  const final = await jevRank(semifinalists);
  const top20 = final.slice(0,20).map((x,i)=>({
    rank:i+1,
    title:x.meme.title,
    subreddit:x.meme.subreddit,
    upvotes:x.meme.ups,
    image:x.meme.url,
    post:x.meme.postLink,
    visual:x.meme.visual || "",
  }));

  return Response.json({
    source:"meme-api.com live Reddit feed",
    collected:all.length,
    semifinalists:semifinalists.length,
    elapsedMs:Date.now()-started,
    top20,
  });
}
