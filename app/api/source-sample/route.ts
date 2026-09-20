export async function GET() {
  const url = "https://raw.githubusercontent.com/eujhwang/meme-cap/main/data/memes-trainval.json";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return Response.json({ error: "source fetch failed", status: res.status }, { status: 502 });
  const data = await res.json();
  const arr = Array.isArray(data) ? data : Object.values(data ?? {});
  return Response.json({
    count: arr.length,
    sample: arr.slice(0, 2),
    keys: arr[0] && typeof arr[0] === "object" ? Object.keys(arr[0]) : [],
  });
}
