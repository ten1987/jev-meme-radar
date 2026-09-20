export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isImagePost(p:any){
  const url = String(p?.url_overridden_by_dest || p?.url || "");
  return /.(jpe?g|png|webp)(?|$)/i.test(url) || p?.post_hint === "image";
}

export async function GET(){
  const sources = [
    ["memes","hot"],["memes","new"],
    ["dankmemes","hot"],["dankmemes","new"],
    ["me_irl","hot"],["me_irl","new"],
    ["wholesomememes","hot"],["wholesomememes","new"],
    ["AdviceAnimals","hot"],["AdviceAnimals","new"],
  ];
  const all:any[] = [];
  for (const [sub,sort] of sources){
    const u = `https://www.reddit.com/r/${sub}/${sort}.json?limit=100&raw_json=1`;
    try{
      const r = await fetch(u,{headers:{"User-Agent":"jev-meme-radar/1.0 by u/ten1987"},cache:"no-store"});
      if(!r.ok) continue;
      const j = await r.json();
      for(const c of j?.data?.children || []){
        const p = c.data;
        if(!isImagePost(p)) continue;
        all.push({
          id:p.id,
          subreddit:p.subreddit,
          title:p.title,
          image:p.url_overridden_by_dest || p.url,
          permalink:"https://www.reddit.com"+p.permalink,
          score:p.score,
          upvote_ratio:p.upvote_ratio,
          comments:p.num_comments,
          created_utc:p.created_utc,
          over_18:p.over_18,
          sort,
        });
      }
    }catch{}
  }
  const byId = new Map<string,any>();
  for(const p of all){
    if(p.over_18) continue;
    if(!byId.has(p.id)) byId.set(p.id,p);
  }
  const items = [...byId.values()].sort((a,b)=>b.created_utc-a.created_utc).slice(0,500);
  return Response.json({count:items.length, sample:items.slice(0,5), items});
}