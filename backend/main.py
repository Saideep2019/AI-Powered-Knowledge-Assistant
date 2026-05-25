from fastapi import FastAPI, UploadFile, File
from pypdf import PdfReader
from sentence_transformers import SentenceTransformer
import chromadb
import os

# FastAPI app
app = FastAPI()

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
    chunk_size = 500

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