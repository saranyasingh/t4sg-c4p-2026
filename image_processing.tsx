import os
from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables from .env file
load_dotenv()

# The OpenAI client automatically reads the OPENAI_API_KEY from the environment
# You do not need to pass the api_key argument explicitly.
client = OpenAI()

# Example usage:
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

