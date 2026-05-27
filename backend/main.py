from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from pypdf import PdfReader
from sentence_transformers import SentenceTransformer

import chromadb
import ollama
import os


# -----------------------------
# FastAPI App
# -----------------------------
app = FastAPI()


# -----------------------------
# CORS
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
async def upload_pdf(file: UploadFile = File(...)):

    # Save uploaded PDF
    file_path = os.path.join(
        UPLOAD_DIR,
        file.filename
    )

    with open(file_path, "wb") as f:
        f.write(await file.read())

    # Read PDF
    reader = PdfReader(file_path)

    all_chunks = []

    chunk_size = 300

    # Process pages individually
    for page_number, page in enumerate(reader.pages):

        extracted = page.extract_text()

        if extracted:

            chunks = [
                extracted[i:i + chunk_size]
                for i in range(
                    0,
                    len(extracted),
                    chunk_size
                )
            ]

            for chunk in chunks:

                all_chunks.append({
                    "text": chunk,
                    "page": page_number + 1,
                    "source": file.filename
                })

    # Store embeddings
    for index, chunk_data in enumerate(all_chunks):

        print(f"Processing chunk {index}")

        embedding = embedding_model.encode(
            chunk_data["text"]
        ).tolist()

        collection.add(
            ids=[f"{file.filename}_{index}"],
            embeddings=[embedding],
            documents=[chunk_data["text"]],
            metadatas=[{
                "page": chunk_data["page"],
                "source": chunk_data["source"]
            }]
        )

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
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=3
    )

    documents = results["documents"][0]
    metadatas = results["metadatas"][0]

    # Build context
    context = "\n".join(documents)

    # Generate answer
    response = ollama.chat(
        model="llama3",
        messages=[
            {
                "role": "system",
                "content": """
                You are a helpful AI assistant.

                ONLY answer using the provided context.

                If the answer is not found in the context,
                say:
                "I could not find that information in the document."
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

    # Build citations
    sources = []

    for doc, meta in zip(documents, metadatas):

        sources.append({
            "text": doc,
            "page": meta["page"],
            "source": meta["source"]
        })

    return {
        "answer": response["message"]["content"],
        "sources": sources
    }