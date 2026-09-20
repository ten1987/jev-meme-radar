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
  preview?: string[];
};

export async function GET() {
  const subs = [
    "memes",
    "dankmemes",
    "me_irl",
    "meirl",
    "wholesomememes",
    "AdviceAnimals",
    "starterpacks",
    "comedyheaven",
    "HistoryMemes",
    "ProgrammerHumor",
    "PrequelMemes",
    "lotrmemes",
  ];

  const all: Meme[] = [];
  for (const sub of subs) {
    try {
      const r = await fetch(`https://meme-api.com/gimme/${sub}/50`, { cache: "no-store" });
      if (!r.ok) continue;
      const j: any = await r.json();
      const memes: Meme[] = Array.isArray(j?.memes) ? j.memes : [];
      for (const m of memes) {
        if (m.nsfw || m.spoiler || !m.url || !m.postLink) continue;
        const clean = m.url.split("?")[0].toLowerCase();
        if (![".jpg",".jpeg",".png",".webp"].some(ext => clean.endsWith(ext))) continue;
        all.push(m);
      }
    } catch {
      // skip failed subreddit
    }
  }

  const seen = new Set<string>();
  const items = all.filter(m => {
    const key = m.postLink || m.url || "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 500);

  return Response.json({
    count: items.length,
    source: "meme-api.com live Reddit feed",
    items,
  });
}
