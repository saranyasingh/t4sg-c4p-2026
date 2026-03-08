import OpenAI from "openai";

const client = new OpenAI();

export async function POST(req: Request) {
  const { prompt } = (await req.json()) as { prompt: string };

  const result = await client.chat.completions.create({
    model: "gpt-4-turbo",
    messages: [
      {
        role: "system",
        content:
          "You are a helpful digital literacy tutor that only answers questions about navigating one's computer. Some example questions could be: How do I find a certain file? How do I send an email? If the user asks about anything else, politely decline and remind them that you can only help with their computer.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const content = result.choices[0]?.message?.content ?? "";
  return Response.json({ content });
}
