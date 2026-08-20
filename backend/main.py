from enum import verify

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
from groq import Groq
from supabase import create_client
import numpy as np
from dotenv import load_dotenv
import os

load_dotenv() 
print("Current working directory:", os.getcwd())
print("Groq API Key:", os.getenv("GROQ_API_KEY"))


import chromadb
import os
import json


# -----------------------------
# FastAPI App
# -----------------------------
app = FastAPI()


client = Groq(
    api_key=os.getenv("GROQ_API_KEY")
)


SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY
)


# -----------------------------
# CORS
# -----------------------------

# allows our frontend (running on port 3000) to access the backend API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"https://documind-frontend-.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -----------------------------
# Embedding Model
# -----------------------------
embedding_model = SentenceTransformer(
    "all-MiniLM-L6-v2"
)


# -----------------------------
# ChromaDB
# -----------------------------
chroma_client = chromadb.PersistentClient(
    path="./chroma_db"
)

collection = chroma_client.get_or_create_collection(
    name="documents"
)


# -----------------------------
# Upload Folder
# -----------------------------
UPLOAD_DIR = "uploads"

os.makedirs(UPLOAD_DIR, exist_ok=True)


# -----------------------------
# Home Route
# -----------------------------
@app.get("/")
def home():

    return {
        "message": "Backend is working"
    }

def _coerce_embedding(value):
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            return []
    return []


def cosine_similarity(a, b):
    a = np.array(a, dtype=float)
    b = np.array(b, dtype=float)

    if a.size == 0 or b.size == 0:
        return -1.0

    denom = (np.linalg.norm(a) * np.linalg.norm(b)) + 1e-8
    return float(np.dot(a, b) / denom)


def fetch_chunks(user_id: str, filename: str | None = None):
    query = (
        supabase
        .table("document_chunks")
        .select("content,page,filename,chunk_index,embedding")
        .eq("user_id", user_id)
    )

    if filename:
        query = query.eq("filename", filename)

    result = query.order("chunk_index").execute()
    return result.data or []



# -----------------------------
# Upload Route
# -----------------------------
@app.post("/upload")
async def upload_pdf(
    user_id: str = Form(...),
    file: UploadFile = File(...)
):
    user_upload_dir = os.path.join(UPLOAD_DIR, user_id)
    os.makedirs(user_upload_dir, exist_ok=True)

    # Save uploaded PDF
    file_path = os.path.join(user_upload_dir, file.filename)
    with open(file_path, "wb") as f:
        f.write(await file.read())

    # Read PDF
    reader = PdfReader(file_path)

    all_chunks = []
    chunk_size = 800
    overlap = 100

    for page_number, page in enumerate(reader.pages):
        extracted = page.extract_text()

        if extracted:
            start = 0
            while start < len(extracted):
                end = start + chunk_size
                chunk_text = extracted[start:end]

                all_chunks.append({
                    "text": chunk_text,
                    "page": page_number + 1,
                    "source": file.filename,
                    "user_id": user_id
                })

                start += chunk_size - overlap

    if not all_chunks:
        return {
            "filename": file.filename,
            "num_chunks": 0,
            "message": "No text found in PDF"
        }

    texts = [chunk["text"] for chunk in all_chunks]
    embeddings = embedding_model.encode(texts).tolist()

    rows = []
    for i, chunk in enumerate(all_chunks):
        rows.append({
            "user_id": user_id,
            "filename": file.filename,
            "page": chunk["page"],
            "chunk_index": i,
            "content": chunk["text"],
            "embedding": embeddings[i],
        })

    print("User ID:", user_id)
    print("Number of chunks:", len(all_chunks))
    print("UPLOAD first chunk:", all_chunks[0])
    print("UPLOAD first row:", rows[0])

    insert_result = supabase.table("document_chunks").insert(rows).execute()

    print("UPLOAD insert result:", insert_result)

    check_result = (
        supabase
        .table("document_chunks")
        .select("id, user_id, filename, page, chunk_index, content")
        .eq("user_id", user_id)
        .eq("filename", file.filename)
        .limit(5)
        .execute()
    )

    print("UPLOAD verify rows:", check_result.data)

    return {
        "filename": file.filename,
        "num_chunks": len(all_chunks),
        "message": "PDF uploaded successfully"
    }


# -----------------------------
# Request Model
# -----------------------------
class QuestionRequest(BaseModel):
    question: str
    history: list = []
    selected_document: str = ""
    user_id: str

class SummaryRequest(BaseModel):
    document: str
    user_id: str

class QuizRequest(BaseModel):
    document: str
    user_id: str

class FlashcardRequest(BaseModel):
    document: str
    user_id : str


# -----------------------------
# Ask Route
# -----------------------------
@app.post("/ask")
def ask(data: QuestionRequest):
    question = data.question

    # Build conversation memory
    conversation_history = ""
    for msg in data.history[-6:]:
        role = msg.get("role", "")
        content = msg.get("content", "")
        conversation_history += f"""
        {role}:
        {content}
        """

    # Embed question
    query_embedding = embedding_model.encode(question).tolist()

    # Get chunks from Supabase
    chunks = fetch_chunks(
        data.user_id,
        data.selected_document if data.selected_document else None
    )

    ranked = []
    for row in chunks:
        row_embedding = _coerce_embedding(row.get("embedding"))
        score = cosine_similarity(query_embedding, row_embedding)
        ranked.append((score, row))

    ranked.sort(key=lambda x: x[0], reverse=True)

    top_rows = [row for score, row in ranked[:3] if score > 0.2]

    if not top_rows:
        return {
            "answer": "No relevant content found in the uploaded documents.",
            "sources": []
        }

    context = "\n".join([row["content"] for row in top_rows])

    sources = []
    for row in top_rows:
        sources.append({
            "text": row["content"],
            "page": row["page"],
            "source": row["filename"]
        })

    response = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {
                "role": "system",
                "content": """
You are a helpful AI assistant.

Use the uploaded document as your primary source of information.

If the answer is found in the document, answer using the document.

If the answer is not found in the document, answer using your own general knowledge.

When answering from your own knowledge, clearly state that the information is based on your general knowledge and was not found in the uploaded document.

Never make up information that is supposedly from the document.
"""
            },
            {
                "role": "user",
                "content": f"""
Conversation History:
{conversation_history}

Context:
{context}

Question:
{question}
"""
            }
        ]
    )

    return {
        "answer": response.choices[0].message.content,
        "sources": sources
    }


    

@app.post("/generate-quiz")
def generate_quiz(request: QuizRequest):
    chunks = fetch_chunks(request.user_id, request.document)

    if not chunks:
        return {"quiz": []}

    text = "\n\n".join([row["content"] for row in chunks])
    text = text[:4000]

    prompt = f"""
You are a JSON generator.

Generate exactly 5 multiple choice questions from the document.

Rules:

- Return ONLY JSON.
- Do NOT return markdown.
- Do NOT return explanations.
- Do NOT return code fences.
- Every question must contain exactly 4 options:
  A, B, C, D.
- answer must be one of:
  A, B, C, D.

Required format:

[
  {{
    "question": "Question text",
    "options": {{
      "A": "Option A",
      "B": "Option B",
      "C": "Option C",
      "D": "Option D"
    }},
    "answer": "A"
  }}
]

Document:

{text}
"""

    response = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[{"role": "user", "content": prompt}]
    )

    print("\n====================")
    print("RAW GROQ RESPONSE")
    print("====================")
    print(response.choices[0].message.content)
    print("====================\n")

    try:
        content = response.choices[0].message.content
        start = content.find("[")
        end = content.rfind("]") + 1
        content = content[start:end]
        quiz_data = json.loads(content)

        return {"quiz": quiz_data}

    except Exception as e:
        print("Quiz JSON Parse Error:", e)
        print(response.choices[0].message.content)
        return {"quiz": []}



@app.get("/documents")
def get_documents(user_id: str | None = None):

    print("user_id received:", user_id)

    if user_id is None:
        return {
            "documents": []
        }

    result = (
        supabase
        .table("document_chunks")
        .select("filename")
        .eq("user_id", user_id)
        .execute()
    )

    rows = result.data or []

    pdfs = sorted({
        row["filename"]
        for row in rows
    })

    return {
        "documents": pdfs
    }





@app.post("/summarize")
def summarize_document(request: SummaryRequest):
    print("STEP 1 - route entered")

    chunks = fetch_chunks(request.user_id, request.document)

    print("STEP 2 - supabase query complete")

    if not chunks:
        print("STEP 3 - no documents found")
        return {
            "summary": "No content found in document."
        }

    text = "\n\n".join([row["content"] for row in chunks])

    print(f"STEP 4 - loaded {len(chunks)} chunks")
    print("STEP 5 - text joined")

    text = text[:12000]

    prompt = f"""
Summarize this document.

Provide:

1. Executive Summary
2. Key Topics
3. Important Findings
4. Conclusion

Document:

{text}
"""

    print("STEP 6 - calling Groq")

    response = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    print("STEP 7 - Groq returned")

    return {
        "summary": response.choices[0].message.content
    }


@app.post("/generate-flashcards")
def generate_flashcards(request: FlashcardRequest):
    import random
    import json

    print("FLASHCARD request.user_id:", request.user_id)
    print("FLASHCARD request.document:", request.document)

    chunks = fetch_chunks(request.user_id, request.document)

    print("FLASHCARD matched chunks:", len(chunks))

    if not chunks:
        return {
            "flashcards": []
        }

    random.shuffle(chunks)
    chunks = chunks[:10]

    text = "\n\n".join([
        row["content"]
        for row in chunks
    ])

    text = text[:4000]

    prompt = f"""
You are a JSON generator.

Generate exactly 5 flashcards.

Rules:

- Return ONLY JSON.
- Do NOT return markdown.
- Do NOT return explanations.
- Do NOT return notes.
- Do NOT return comments.
- Do NOT add text outside JSON.

- Use ONLY information explicitly found in the document.

- Do NOT invent facts.
- Do NOT guess.
- Do NOT create flashcards for topics not present in the document.

- The 5 flashcards must come from different topics.

- Do not repeat concepts.

- Do not generate more than one flashcard about the same fact.

- Every flashcard must have a non-empty front.

- Every flashcard must have a non-empty back.

- Never use placeholders.

Required format:

[
  {{
    "front": "Question",
    "back": "Answer"
  }}
]

Document:

{text}
"""

    response = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {
                "role": "user",
                "content": prompt
            }
        ]
    )

    print("\n====================")
    print("RAW FLASHCARD RESPONSE")
    print("====================")
    print(response.choices[0].message.content)
    print("====================\n")

    try:
        content = response.choices[0].message.content

        start = content.find("[")
        end = content.rfind("]") + 1
        content = content[start:end]

        flashcard_data = json.loads(content)

        flashcard_data = [
            card
            for card in flashcard_data
            if card.get("front") and card.get("back")
        ]

        return {
            "flashcards": flashcard_data
        }

    except Exception as e:
        print("Flashcard JSON Parse Error:", e)
        print(response.choices[0].message.content)

        return {
            "flashcards": []
        }




@app.delete("/documents/{filename}")
def delete_document(
    filename: str,
    user_id: str
):
    # Delete local PDF (optional)
    user_upload_dir = os.path.join(
        UPLOAD_DIR,
        user_id
    )

    file_path = os.path.join(
        user_upload_dir,
        filename
    )

    if os.path.exists(file_path):
        os.remove(file_path)

    # Delete all chunks from Supabase
    result = (
        supabase
        .table("document_chunks")
        .delete()
        .eq("user_id", user_id)
        .eq("filename", filename)
        .execute()
    )

    print("DELETE result:", result)

    return {
        "message": f"{filename} deleted"
    }