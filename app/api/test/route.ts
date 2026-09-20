import { experimental_evaluate as evaluate } from "ai";

const criteria = [
  "0 - terrible",
  "1 - very weak",
  "2 - weak",
  "3 - below average",
  "4 - average",
  "5 - decent",
  "6 - good",
  "7 - very good",
  "8 - excellent",
  "9 - exceptional",
] as const;

export async function GET() {
  const result = await evaluate({
    model: "typesafe-ai/jev",
    state: "Meme: When you check your bank account after one weekend out.",
    questions: {
      viral: {
        type: "score",
        instructions: "Score broad viral meme potential.",
        criteria,
      },
      keep: {
        type: "boolean",
        instructions: "Should this advance to a viral meme shortlist?",
      },
    },
  });
  return Response.json({ answers: result.answers, providerMetadata: result.providerMetadata });
}
