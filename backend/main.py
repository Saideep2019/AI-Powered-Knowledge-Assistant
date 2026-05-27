from fastapi import FastAPI, UploadFile, File
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
import chromadb
import os
import ollama
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# FastAPI app
app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Local embedding model
embedding_model = SentenceTransformer(
    "all-MiniLM-L6-v2"
)
# ChromaDB setup
chroma_client = chromadb.PersistentClient(
    path="./chroma_db"
)


collection = chroma_client.get_or_create_collection(
    name="documents"
)

# Upload folder
UPLOAD_DIR = "uploads"

os.makedirs(UPLOAD_DIR, exist_ok=True)


@app.get("/")
def home():
    return {"message": "Backend is working"}


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):

    # Save uploaded PDF
    file_path = os.path.join(UPLOAD_DIR, file.filename)

    with open(file_path, "wb") as f:
        f.write(await file.read())

    # Read PDF
    reader = PdfReader(file_path)

    text = ""

    for page in reader.pages:
        extracted = page.extract_text()

        if extracted:
            text += extracted

    # Chunking
    chunk_size = 300

    chunks = [
        text[i:i + chunk_size]
        for i in range(0, len(text), chunk_size)
    ]

    # Generate embeddings + store in ChromaDB
    for index, chunk in enumerate(chunks):

        print(f"Processing chunk {index}")

        embedding = embedding_model.encode(
            chunk
        ).tolist()

        collection.add(
            ids=[f"{file.filename}_{index}"],
            embeddings=[embedding],
            documents=[chunk]
        )

    return {
        "filename": file.filename,
        "num_chunks": len(chunks),
        "first_chunk": chunks[0] if chunks else "",
        "message": "PDF processed and embeddings stored successfully"
    }




@app.get("/search")
def search(query: str):

    # Create query embedding
    query_embedding = embedding_model.encode(
        query
    ).tolist()

    # Search vector database
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=2
    )

    return {
        "query": query,
        "results": results
    }



class QuestionRequest(BaseModel):
    question: str
    
@app.post("/ask")
def ask(data: QuestionRequest):

    question = data.question

    query_embedding = embedding_model.encode(
        question
    ).tolist()

    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=2
    )

    context = "\n".join(
        results["documents"][0]
    )

    response = ollama.chat(
        model="llama3",
        messages=[
            {
                "role": "system",
                "content": "Answer questions using the provided context."
            },
            {
                "role": "user",
                "content": f"""
                Context:
                {context}

                Question:
                {question}
                """
            }
        ]
    )

    return {
        "answer": response["message"]["content"]
    }