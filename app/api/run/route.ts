import { experimental_evaluate as evaluate } from "ai";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const criteria = [
  "0 - no viral meme potential",
  "1 - extremely weak",
  "2 - weak",
  "3 - below average",
  "4 - average",
  "5 - decent",
  "6 - strong",
  "7 - very strong",
  "8 - excellent",
  "9 - exceptional viral meme potential",
] as const;

type AnyObj = Record<string, any>;

function compact(value: any, depth = 0): any {
  if (depth > 3 || value == null) return value;
  if (typeof value === "string") return value.length > 1600 ? value.slice(0, 1600) : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 12).map(v => compact(v, depth + 1));
  if (typeof value === "object") {
    const out: AnyObj = {};
    for (const [k, v] of Object.entries(value)) {
      if (/image|img|url|path|file|title|caption|meme|text|metaphor|description|meaning|ocr|id/i.test(k)) {
        out[k] = compact(v, depth + 1);
      }
    }
    if (Object.keys(out).length === 0) {
      for (const [k, v] of Object.entries(value).slice(0, 12)) out[k] = compact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

async function scoreBatch(items: any[], offset: number) {
  const questions: Record<string, any> = {};
  for (let i = 0; i < items.length; i++) {
    questions[`m${i}`] = {
      type: "score",
      instructions:
        `Score ONLY meme at state index ${i} for broad viral meme potential. Judge the meme idea itself using humor/emotional payoff, immediate comprehensibility, relatability, shareability, memorability, originality, and ability to work beyond a tiny niche. Use all textual annotations in that item, including title, meme caption, literal image description, OCR/text and visual-metaphor explanation when present. Do not reward an item merely because it has more annotation text.`,
      criteria,
    };
  }

  const result = await evaluate({
    model: "typesafe-ai/jev",
    state: items.map(compact),
    questions,
  });

  const confidence = (result.providerMetadata as any)?.typesafe?.confidence ?? {};
  return items.map((item, i) => {
    const answer: any = (result.answers as any)[`m${i}`];
    return {
      index: offset + i,
      score: Number(answer?.score ?? 0),
      confidence: confidence[`m${i}`] ?? null,
      item,
    };
  });
}

async function mapWithConcurrency<T, R>(
  input: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(input.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, input.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= input.length) break;
      results[i] = await worker(input[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 5000), 1), 5000);
  const batchSize = Math.min(Math.max(Number(searchParams.get("batch") ?? 50), 10), 100);
  const concurrency = Math.min(Math.max(Number(searchParams.get("concurrency") ?? 8), 1), 12);

  const sourceUrl =
    "https://raw.githubusercontent.com/eujhwang/meme-cap/main/data/memes-trainval.json";

  const sourceRes = await fetch(sourceUrl, { cache: "no-store" });
  if (!sourceRes.ok) {
    return Response.json(
      { error: "Failed to fetch MemeCap source", status: sourceRes.status },
      { status: 502 },
    );
  }

  const sourceText = await sourceRes.text();
  const sanitized = sourceText
    .replace(/\bNaN\b/g, "null")
    .replace(/-?\bInfinity\b/g, "null");
  const raw = JSON.parse(sanitized);
  const all = (Array.isArray(raw) ? raw : Object.values(raw ?? {})).slice(0, limit);
  const batches: { items: any[]; offset: number }[] = [];
  for (let i = 0; i < all.length; i += batchSize) {
    batches.push({ items: all.slice(i, i + batchSize), offset: i });
  }

  const startedAt = Date.now();
  const scoredBatches = await mapWithConcurrency(
    batches,
    concurrency,
    async batch => scoreBatch(batch.items, batch.offset),
  );
  const scored = scoredBatches.flat();
  scored.sort((a, b) => b.score - a.score || (b.confidence ?? 0) - (a.confidence ?? 0));

  return Response.json({
    source: "MemeCap train+val",
    sourceUrl,
    requested: limit,
    evaluated: scored.length,
    batchSize,
    batches: batches.length,
    concurrency,
    elapsedMs: Date.now() - startedAt,
    top20: scored.slice(0, 20),
  });
}
