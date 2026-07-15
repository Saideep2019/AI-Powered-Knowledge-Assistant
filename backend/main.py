from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
from groq import Groq
from dotenv import load_dotenv
import os

load_dotenv()  


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


# -----------------------------
# Upload Route
# -----------------------------
@app.post("/upload")
async def upload_pdf(
    user_id: str = Form(...),
    file: UploadFile = File(...)
):
    
    user_upload_dir = os.path.join(
    UPLOAD_DIR,
    user_id
)

    os.makedirs(
        user_upload_dir,
        exist_ok=True
    )

    # Save uploaded PDF
    file_path = os.path.join(
        user_upload_dir,
        file.filename
    )

    with open(file_path, "wb") as f:
        f.write(await file.read())

    # Read PDF
    reader = PdfReader(file_path)

    all_chunks = []

    chunk_size = 800
    overlap = 100

    # Process pages individually
    for page_number, page in enumerate(reader.pages):

        extracted = page.extract_text()

        if extracted:

            chunks = []

            start = 0

            while start < len(extracted):

                end = start + chunk_size

                chunks.append(
                    extracted[start:end]
                )

                start += chunk_size - overlap

            for chunk in chunks:

                all_chunks.append({
                    "text": chunk,
                    "page": page_number + 1,
                    "source": file.filename
                })

    # Generate embeddings for ALL chunks at once
    texts = [
        chunk["text"]
        for chunk in all_chunks
    ]

    embeddings = embedding_model.encode(
        texts
    ).tolist()

    ids = [
        f"{file.filename}_{i}"
        for i in range(len(all_chunks))
    ]

    documents = [
        chunk["text"]
        for chunk in all_chunks
    ]

    metadatas = [
        {
            "page": chunk["page"],
            "source": chunk["source"],
            "user_id": user_id

            
        }
        for chunk in all_chunks
    ]

    print("Adding document to Chroma")
    print("User ID:", user_id)
    print("Number of chunks:", len(all_chunks))


    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=documents,
        metadatas=metadatas
    )

    print(collection.count())

    return {
        "filename": file.filename,
        "num_chunks": len(all_chunks),
        "message": "PDF uploaded successfully"
    }

# -----------------------------
# Search Route
# -----------------------------
@app.get("/search")
def search(query: str):

    query_embedding = embedding_model.encode(
        query
    ).tolist()

    
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=2
    )


    return {
        "query": query,
        "results": results
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
    query_embedding = embedding_model.encode(
        question
    ).tolist()

    # Retrieve chunks
    if data.selected_document:

        results = collection.query(
    query_embeddings=[query_embedding],
    n_results=3,
    where={
        "$and": [
            {"user_id": data.user_id},
            {"source": data.selected_document}
        ]
    }
)

       

    else:

        results = collection.query(
    query_embeddings=[query_embedding],
    n_results=3,
    where={
        "user_id": data.user_id
    }
)

    print("Distances:", results["distances"])
    best_distance = results["distances"][0][0]

    documents = results["documents"][0]
    metadatas = results["metadatas"][0]

    use_documents = best_distance < 1.2

    if not use_documents:

        documents = []
        metadatas = []

    if use_documents:
        context = "\n".join(documents)
    else:
     context = ""



    sources = []

    if use_documents:

        for doc, meta in zip(documents, metadatas):

            sources.append({
                "text": doc,
                "page": meta["page"],
                "source": meta["source"]
            })

    # Generate answer
    response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
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
        "answer":
        response.choices[0].message.content,
        "sources":
        sources
    }

@app.post("/generate-quiz")
def generate_quiz(request: QuizRequest):

    results = collection.get(
    where={
        "$and": [
            {
                "user_id": request.user_id
            },
            {
                "source": request.document
            }
        ]
    },
    limit=10
)

    if not results["documents"]:
        return {
            "quiz": []
        }

    chunks = results["documents"]

    if isinstance(chunks[0], list):
        chunks = chunks[0]

    text = "\n\n".join(chunks)

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
    model="llama-3.3-70b-versatile",
    messages=[
        {
            "role": "user",
            "content": prompt
        }
    ]
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

        return {
            "quiz": quiz_data
        }

    except Exception as e:

        print(
            "Quiz JSON Parse Error:",
            e
        )

        print(
            response.choices[0].message.content
        )

        return {
            "quiz": []
        }
    


@app.post("/generate-flashcards")
def generate_flashcards(
    request: FlashcardRequest
):

    results = collection.get(
    where={
        "$and": [
            {
                "user_id": request.user_id
            },
            {
                "source": request.document
            }
        ]
    },
    limit=20
)

    if not results["documents"]:
        return {
            "flashcards": []
        }

    chunks = results["documents"]

    if isinstance(chunks[0], list):
        chunks = chunks[0]

    import random

    random.shuffle(chunks)

    chunks = chunks[:10]

    text = "\n\n".join(chunks)

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

- Never write:
  "(information unavailable)"

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
    model="llama-3.3-70b-versatile",
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

        flashcard_data = json.loads(
            content
        )

        flashcard_data = [

            card

            for card in flashcard_data

            if card.get("front")
            and card.get("back")

        ]

        return {
            "flashcards":
            flashcard_data
        }

    except Exception as e:

        print(
            "Flashcard JSON Parse Error:",
            e
        )

        print(
            response.choices[0].message.content
        )

        return {
            "flashcards": []
        }



@app.get("/documents")
def get_documents(user_id: str | None = None):

    print("user_id received:", user_id)

    if user_id is None:
        return {
            "documents": []
        }

    user_upload_dir = os.path.join(
        UPLOAD_DIR,
        user_id
    )

    if not os.path.exists(user_upload_dir):
        return {
            "documents": []
        }

    files = os.listdir(user_upload_dir)

    pdfs = [
        file for file in files
        if file.endswith(".pdf")
    ]

    return {
        "documents": pdfs
    }






@app.post("/summarize")
def summarize_document(request: SummaryRequest):

    print("STEP 1 - route entered")

    results = collection.get(
    where={
        "$and": [
            {
                "user_id": request.user_id
            },
            {
                "source": request.document
            }
        ]
    }
)

    print("STEP 2 - chroma query complete")

    if not results["documents"]:
        print("STEP 3 - no documents found")

        return {
            "summary":
            "No content found in document."
        }

    chunks = results["documents"]

    # Handle ChromaDB nested list structure
    if isinstance(chunks[0], list):
        chunks = chunks[0]

    print(f"STEP 4 - loaded {len(chunks)} chunks")
    
    text = "\n\n".join(chunks)

    print("STEP 5 - text joined")

    # Limit context size
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
    model="llama-3.3-70b-versatile",
    messages=[
        {
            "role": "user",
            "content": prompt
        }
    ]
)

    print("STEP 7 - Groq returned")

    return {
        "summary":
        response.choices[0].message.content
    }


@app.delete("/documents/{filename}")
def delete_document(
    filename: str,
    user_id: str
):
    
    

    # Delete PDF file
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

    # Delete Chroma entries
    results = collection.get(
    where={
        "$and": [
            {
                "user_id": user_id
            },
            {
                "source": filename
            }
        ]
    }
)

    if results["ids"]:

        collection.delete(
            ids=results["ids"]
        )

    return {
        "message": f"{filename} deleted"
    }