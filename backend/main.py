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
            "source": chunk["source"]
        }
        for chunk in all_chunks
    ]

    collection.add(
        ids=ids,
        embeddings=embeddings,
        documents=documents,
        metadatas=metadatas
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


@app.get("/documents")
def get_documents():

    files = os.listdir(UPLOAD_DIR)

    pdfs = [
        file for file in files
        if file.endswith(".pdf")
    ]

    return {
        "documents": pdfs
    }

@app.delete("/documents/{filename}")
def delete_document(filename: str):

    # Delete PDF file
    file_path = os.path.join(
        UPLOAD_DIR,
        filename
    )

    if os.path.exists(file_path):
        os.remove(file_path)

    # Delete Chroma entries
    results = collection.get(
        where={
            "source": filename
        }
    )

    if results["ids"]:

        collection.delete(
            ids=results["ids"]
        )

    return {
        "message": f"{filename} deleted"
    }

