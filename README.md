DocuMind Backend

FastAPI backend for DocuMind, an AI-powered document assistant that processes PDF files and supports document-grounded chat, semantic search, summaries, quizzes, and flashcards.

The active frontend is maintained in a separate repository: DocuMind Frontend.

Features

Upload and extract text from PDF documents

Split page text into overlapping chunks

Generate embeddings with sentence-transformers/all-MiniLM-L6-v2

Store document chunks and metadata in ChromaDB

Retrieve relevant passages with semantic search

Generate answers with source filenames and page numbers

Preserve recent conversation context during document chat

Generate five-question multiple-choice quizzes

Generate five study flashcards from document content

Produce structured document summaries

List and delete uploaded documents

Separate stored documents by a client-provided user ID

Architecture

flowchart TD
    A[PDF upload] --> B[PyPDF text extraction]
    B --> C[Chunking and embeddings]
    C --> D[ChromaDB storage]
    E[User request] --> F[Semantic retrieval]
    D --> F
    F --> G[Groq generation]
    G --> H[Answer and citations]

Retrieval-Augmented Generation Flow

The client uploads a PDF with a user ID.

The backend extracts text page by page and divides it into overlapping chunks.

SentenceTransformer generates an embedding for every chunk.

ChromaDB stores the text, embedding, page number, source filename, and user ID.

When a user asks a question, the backend retrieves the most relevant chunks from the selected document or the user's document collection.

The retrieved context and recent conversation history are sent to Groq.

The API returns the generated answer and any matching filename and page citations.

Technology Stack

Language: Python

API: FastAPI and Uvicorn

PDF processing: PyPDF

Embeddings: SentenceTransformers (all-MiniLM-L6-v2)

Vector database: ChromaDB

LLM provider: Groq

Model: llama-3.3-70b-versatile

Validation: Pydantic

API Endpoints

FastAPI generates interactive documentation at /docs while the application is running.

Method

Endpoint

Purpose

Main inputs

GET

/

Health check

None

POST

/upload

Upload, chunk, embed, and store a PDF

Multipart user_id and file

GET

/search

Run a development semantic-search query

Query parameter query

POST

/ask

Ask a document-grounded question

question, history, selected_document, user_id

POST

/generate-quiz

Generate five multiple-choice questions

document, user_id

POST

/generate-flashcards

Generate five flashcards

document, user_id

GET

/documents

List a user's uploaded PDFs

Query parameter user_id

POST

/summarize

Generate a structured document summary

document, user_id

DELETE

/documents/{filename}

Delete a PDF and its ChromaDB records

Path filename, query parameter user_id

Local Setup

Prerequisites

Python 3.10 or newer

A Groq API key

Installation

Clone the repository and enter the backend directory:

git clone https://github.com/Saideep2019/AI-Powered-Knowledge-Assistant.git
cd AI-Powered-Knowledge-Assistant/backend

Create a virtual environment:

python -m venv .venv

Activate it on Windows PowerShell:

.\.venv\Scripts\Activate.ps1

Activate it on macOS or Linux:

source .venv/bin/activate

Install the dependencies:

pip install -r requirements.txt

Create a .env file inside backend/:

GROQ_API_KEY=your_groq_api_key

Do not commit the completed .env file.

Start the development server from the backend/ directory:

uvicorn main:app --reload

Open:

API: http://127.0.0.1:8000

Swagger documentation: http://127.0.0.1:8000/docs

ReDoc documentation: http://127.0.0.1:8000/redoc

The first start may take longer while SentenceTransformer downloads the embedding model.

Local Data

During development, the backend creates:

backend/
|-- chroma_db/      # Persistent ChromaDB vector data
|-- uploads/        # Uploaded PDFs grouped by user ID
|-- main.py         # FastAPI routes and application logic
`-- requirements.txt

The chroma_db/ and uploads/ directories contain runtime data and should not be committed to Git. A production deployment should use durable, access-controlled storage instead of relying on an ephemeral application filesystem.

CORS

The current configuration accepts requests from:

http://localhost:3000

http://127.0.0.1:3000

Vercel preview deployments matching the configured DocuMind frontend pattern

Update the allowed origins when the production frontend URL changes.

Security Note

The current implementation uses a client-provided user_id to filter documents, but it does not verify an authenticated user token. Authentication and server-side ownership checks should be added before using the API with private or sensitive documents.

Planned Improvements

Verify Supabase authentication tokens on protected routes

Move file and vector storage to durable cloud services

Validate upload types, filenames, user IDs, and file sizes

Add automated unit and API tests

Add structured error handling and application logging

Move routes, services, models, and repositories into separate modules

Add rate limiting and production monitoring

Related Repository

DocuMind Frontend

License

Add a license before permitting redistribution or reuse.
