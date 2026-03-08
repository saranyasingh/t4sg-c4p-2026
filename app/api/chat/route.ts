import OpenAI from "openai";

const client = new OpenAI();

export async function POST(req: Request) {
  const { prompt } = (await req.json()) as { prompt: string };

  const result = await client.chat.completions.create({
    model: "gpt-4-turbo",
    stream: true,
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

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      for await (const chunk of result) {
        const delta = chunk.choices[0]?.delta?.content;

        if (delta) {
          controller.enqueue(encoder.encode(delta));
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
