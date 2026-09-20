import { experimental_evaluate as evaluate } from "ai";

const humorCriteria = [
  "No humor or comedic payoff",
  "Barely amusing",
  "Slightly amusing",
  "Some humor, but the payoff is weak",
  "Moderately funny",
  "Clearly funny",
  "Strong comedic payoff",
  "Very funny and memorable",
  "Exceptionally funny",
  "Outstanding, immediate comedic payoff",
] as const;

const shareabilityCriteria = [
  "Not relatable or worth sharing",
  "Very unlikely to be shared",
  "Limited relatability and sharing appeal",
  "Some niche sharing appeal",
  "Moderately relatable",
  "Clearly relatable and shareable",
  "Strong sharing potential",
  "Very broad sharing appeal",
  "Exceptionally shareable",
  "Outstanding viral sharing potential",
] as const;

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  let text = "";

  if (contentType.includes("application/json")) {
    text = (await req.json()).text ?? "";
  } else {
    const formData = await req.formData();
    text = String(formData.get("text") ?? "");
  }

  if (!text) {
    return Response.json({ error: "text required" }, { status: 400 });
  }

  const result = await evaluate({
    model: "typesafe-ai/jev",
    state: text,
    questions: {
      funny: {
        type: "score",
        instructions:
          "How strong is the meme's humor and immediate comedic payoff?",
        criteria: humorCriteria,
      },
      shareable: {
        type: "score",
        instructions:
          "How likely is this meme concept to feel broadly relatable and worth sharing?",
        criteria: shareabilityCriteria,
      },
      keep: {
        type: "boolean",
        instructions:
          "Should this meme advance to a smaller candidate pool for human review?",
      },
    },
  });

  return Response.json({
    answers: result.answers,
    providerMetadata: result.providerMetadata,
  });
}
