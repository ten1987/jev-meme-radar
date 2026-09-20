import { generateText } from "ai";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await generateText({
      model:"inclusionai/ling-3.0-flash-vl-free",
      maxOutputTokens:300,
      messages:[{
        role:"user",
        content:[
          {type:"text",text:"Read all visible meme text and explain the joke in one sentence."},
          {type:"file",mediaType:"image",data:new URL("https://i.redd.it/3qu7yepv53qh1.png")},
        ],
      }],
    });
    return Response.json({text:result.text,usage:result.usage,providerMetadata:result.providerMetadata});
  } catch (e:any) {
    return Response.json({error:String(e?.message||e),stack:String(e?.stack||"")},{status:500});
  }
}