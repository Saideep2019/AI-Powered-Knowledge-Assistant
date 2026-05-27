"use client";

import { useEffect, useState } from "react";

type Source = {
  text: string;
  page: number;
  source: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
};

export default function Home() {

  const [file, setFile] =
    useState<File | null>(null);

  const [documents, setDocuments] =
    useState<string[]>([]);

  const [selectedDocument, setSelectedDocument] =
    useState("");

  const [uploadMessage, setUploadMessage] =
    useState("");

  const [question, setQuestion] =
    useState("");

  const [chat, setChat] =
    useState<Message[]>([]);

  const [loading, setLoading] =
    useState(false);


  // -----------------------------
  // Load Chat History
  // -----------------------------
  useEffect(() => {

    const savedChat =
      localStorage.getItem("chatHistory");

    if (savedChat) {
      setChat(JSON.parse(savedChat));
    }

  }, []);


  // -----------------------------
  // Save Chat History
  // -----------------------------
  useEffect(() => {

    localStorage.setItem(
      "chatHistory",
      JSON.stringify(chat)
    );

  }, [chat]);


  // -----------------------------
  // Fetch Uploaded PDFs
  // -----------------------------
  const fetchDocuments = async () => {

    try {

      const response = await fetch(
        "http://127.0.0.1:8000/documents"
      );

      const data = await response.json();

      setDocuments(data.documents);

    } catch (error) {

      console.error(error);
    }
  };


  // -----------------------------
  // Load Documents on Startup
  // -----------------------------
  useEffect(() => {
    fetchDocuments();
  }, []);


  // -----------------------------
  // Upload PDF
  // -----------------------------
  const handleUpload = async () => {

    if (!file) {

      setUploadMessage(
        "Please select a PDF first."
      );

      return;
    }

    const formData = new FormData();

    formData.append("file", file);

    try {

      setUploadMessage("Uploading PDF...");

      const response = await fetch(
        "http://127.0.0.1:8000/upload",
        {
          method: "POST",
          body: formData,
        }
      );

      const data = await response.json();

      console.log(data);

      if (response.ok) {

        setUploadMessage(
          "PDF uploaded successfully!"
        );

        fetchDocuments();

      } else {

        setUploadMessage("Upload failed.");
      }

    } catch (error) {

      console.error(error);

      setUploadMessage(
        "Something went wrong during upload."
      );
    }
  };


  // -----------------------------
  // Ask Question
  // -----------------------------
  const askQuestion = async () => {

    if (!question.trim() || loading) return;

    const currentQuestion = question;

    // Add user message
    const userMessage: Message = {
      role: "user",
      content: currentQuestion,
    };

    setChat((prev) => [
      ...prev,
      userMessage
    ]);

    setQuestion("");

    setLoading(true);

    try {

      const response = await fetch(
        "http://127.0.0.1:8000/ask",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            question: currentQuestion,
            history: chat,
            selected_document:
              selectedDocument,
          }),
        }
      );

      const data = await response.json();

      console.log(data);

      const aiMessage: Message = {
        role: "assistant",
        content: data.answer,
        sources: data.sources,
      };

      setChat((prev) => [
        ...prev,
        aiMessage
      ]);

    } catch (error) {

      console.error(error);

      const errorMessage: Message = {
        role: "assistant",
        content:
          "Error getting AI response.",
      };

      setChat((prev) => [
        ...prev,
        errorMessage
      ]);
    }

    setLoading(false);
  };


  return (
    <main className="min-h-screen bg-gray-100 p-8">

      <div className="max-w-5xl mx-auto">

        <h1 className="text-4xl font-bold mb-8 text-center">
          AI Knowledge Assistant
        </h1>


        {/* Upload Section */}
        <div className="bg-white p-6 rounded-2xl shadow mb-8">

          <input
            type="file"

            accept="application/pdf"

            onChange={(e) => {

              const selectedFile =
                e.target.files?.[0];

              if (selectedFile) {
                setFile(selectedFile);
              }
            }}

            className="block w-full border p-3 rounded-xl mb-4"
          />

          {file && (
            <p className="mb-4 text-sm text-green-600">
              Selected: {file.name}
            </p>
          )}

          <button
            onClick={handleUpload}
            className="bg-black text-white px-6 py-3 rounded-xl"
          >
            Upload PDF
          </button>

          {uploadMessage && (
            <p className="mt-4 text-gray-700">
              {uploadMessage}
            </p>
          )}

        </div>


        {/* Document Selector */}
        <div className="bg-white p-4 rounded-2xl shadow mb-6">

          <label className="block mb-2 font-semibold">
            Select Document
          </label>

          <select
            value={selectedDocument}

            onChange={(e) =>
              setSelectedDocument(
                e.target.value
              )
            }

            className="border p-3 rounded-xl w-full"
          >

            <option value="">
              All Documents
            </option>

            {documents.map((doc) => (

              <option
                key={doc}
                value={doc}
              >
                {doc}
              </option>

            ))}

          </select>

        </div>


        {/* Chat Section */}
        <div className="bg-white rounded-2xl shadow p-6">

          <div className="h-[500px] overflow-y-auto mb-4 border rounded-xl p-4 bg-gray-50">

            {chat.length === 0 && (
              <p className="text-gray-500">
                Ask questions about your PDFs.
              </p>
            )}

            {chat.map((msg, index) => (

              <div
                key={index}

                className={`mb-4 flex ${
                  msg.role === "user"
                    ? "justify-end"
                    : "justify-start"
                }`}
              >

                <div
                  className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                    msg.role === "user"
                      ? "bg-black text-white"
                      : "bg-gray-200 text-black"
                  }`}
                >

                  <div>

                    <p>{msg.content}</p>

                    {msg.sources && (

                      <div className="mt-3 text-xs text-gray-600">

                        {msg.sources.map(
                          (source, idx) => (

                            <div
                              key={idx}
                              className="mt-2 border-t pt-2"
                            >

                              <p>
                                Source:
                                {" "}
                                {source.source}
                              </p>

                              <p>
                                Page:
                                {" "}
                                {source.page}
                              </p>

                            </div>

                          )
                        )}

                      </div>

                    )}

                  </div>

                </div>

              </div>

            ))}

            {loading && (
              <p className="text-gray-500">
                AI is thinking...
              </p>
            )}

          </div>


          {/* Input */}
          <div className="flex gap-4">

            <input
              type="text"

              placeholder="Ask a question..."

              value={question}

              onChange={(e) =>
                setQuestion(
                  e.target.value
                )
              }

              onKeyDown={(e) => {

                if (e.key === "Enter") {
                  askQuestion();
                }
              }}

              className="flex-1 border p-3 rounded-xl"
            />

            <button
              onClick={askQuestion}

              disabled={loading}

              className="bg-black text-white px-6 rounded-xl disabled:opacity-50"
            >
              {loading
                ? "Thinking..."
                : "Send"}
            </button>

          </div>

        </div>

      </div>

    </main>
  );
}