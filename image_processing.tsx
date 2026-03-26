import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

client = OpenAI()

try:
    chat_completion = client.chat.completions.create(
        messages=[
            {
                "role": "user",
                "content": "Say this is a test",
            }
        ],
        model="gpt-3.5-turbo",
    )
    print(chat_completion.choices[0].message.content)

except Exception as e:
    print(f"An error occurred: {e}")

