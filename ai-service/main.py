import os
import json
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

class ReviewRequest(BaseModel):
    code: str
    language: str

class CodeReviewResponse(BaseModel):
    bugs: list[str]
    style: list[str]
    security: list[str]
    summary: str
    score: int

system_prompt = """
You are an expert AI code reviewer. You must continuously output valid JSON outlining your review of the provided code.
"""

@app.post("/review")
async def review_code(req: ReviewRequest):
    model = genai.GenerativeModel(
        "gemini-2.5-flash",
        system_instruction=system_prompt,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            response_schema=CodeReviewResponse
        )
    )
    
    async def generate_review():
        try:
            response = await model.generate_content_async(
                f"Review this {req.language} code snippet:\n\n{req.code}",
                stream=True
            )
            
            async for chunk in response:
                delta = chunk.text
                if delta:
                    # Encase the raw chunk in a json string payload so SSE parser can reconstruct it properly
                    # even if it contains new lines.
                    yield f"data: {json.dumps(delta)}\n\n"
                    
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            # Send an error if something crashes
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
    
    return StreamingResponse(generate_review(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    # Local dev runner
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
