export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Meme = {
  postLink?: string;
  subreddit?: string;
  title?: string;
  url?: string;
  nsfw?: boolean;
  spoiler?: boolean;
  author?: string;
  ups?: number;
};

const subs = [
  "memes","dankmemes","me_irl","meirl","wholesomememes","AdviceAnimals",
  "starterpacks","comedyheaven","HistoryMemes","ProgrammerHumor","PrequelMemes","lotrmemes",
  "MemeEconomy","terriblefacebookmemes","BikiniBottomTwitter","SequelMemes",
  "HarryPotterMemes","marvelmemes","AnimeMemes","dogelore","surrealmemes",
  "MinecraftMemes","gamingmemes","CleanMemes","StarWarsMemes","TheSimpsonsMemes",
  "OfficeMemes","SpidermanMemes","lotr","funny"
];

async function fetchSub(sub:string, round:number):Promise<Meme[]> {
  try {
    const r = await fetch(`https://meme-api.com/gimme/${sub}/50?r=${round}&t=${Date.now()}`, {cache:"no-store"});
    if (!r.ok) return [];
    const j:any = await r.json();
    return Array.isArray(j?.memes) ? j.memes : [];
  } catch { return []; }
}

export async function GET() {
  const seen = new Set<string>();
  const items:Meme[] = [];
  for (let round=0; round<4 && items.length<500; round++) {
    const chunks = await Promise.all(subs.map(sub => fetchSub(sub, round)));
    for (const chunk of chunks) {
      for (const m of chunk) {
        if (m.nsfw || m.spoiler || !m.url || !m.postLink) continue;
        const clean = String(m.url).split("?")[0].toLowerCase();
        if (![".jpg",".jpeg",".png",".webp"].some(ext=>clean.endsWith(ext))) continue;
        const key = m.postLink || m.url || "";
        if (!key || seen.has(key)) continue;
        seen.add(key);
        items.push({
          postLink:m.postLink, subreddit:m.subreddit, title:m.title,
          url:m.url, author:m.author, ups:Number(m.ups||0)
        });
        if (items.length>=500) break;
      }
      if (items.length>=500) break;
    }
  }
  return Response.json({count:items.length, items:items.slice(0,500)});
}