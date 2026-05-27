"use client";

import { useState } from "react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    if (!file) {
      setUploadMessage("Please select a PDF first.");
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
        setUploadMessage("PDF uploaded successfully!");
      } else {
        setUploadMessage("Upload failed.");
      }
    } catch (error) {
      console.error("Upload error:", error);
      setUploadMessage("Something went wrong during upload.");
    }
  };

  const askQuestion = async () => {
    if (!question.trim() || loading) return;

    const currentQuestion = question;

    const userMessage: Message = {
      role: "user",
      content: currentQuestion,
    };

    setChat((prev) => [...prev, userMessage]);

    setQuestion("");
    setLoading(true);

    try {
      console.log("Sending question:", currentQuestion);

      const response = await fetch(
        "http://127.0.0.1:8000/ask",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: currentQuestion,
          }),
        }
      );

      console.log("Response status:", response.status);

      const data = await response.json();

      console.log("Response data:", data);

      if (!response.ok) {
        throw new Error(data.detail || "Request failed");
      }

      const aiMessage: Message = {
        role: "assistant",
        content: data.answer || "No response generated.",
      };

      setChat((prev) => [...prev, aiMessage]);

    } catch (error) {
      console.error("Ask error:", error);

      const errorMessage: Message = {
        role: "assistant",
        content: "Error getting AI response.",
      };

      setChat((prev) => [...prev, errorMessage]);
    }

    setLoading(false);
  };

  return (
    <main className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">

        <h1 className="text-4xl font-bold mb-8 text-center">
          AI Knowledge Assistant
        </h1>

        <div className="bg-white p-6 rounded-2xl shadow mb-8">

          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const selectedFile = e.target.files?.[0];

              if (selectedFile) {
                console.log("Selected file:", selectedFile.name);
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
            className="bg-black text-white px-6 py-3 rounded-xl hover:bg-gray-800"
          >
            Upload PDF
          </button>

          {uploadMessage && (
            <p className="mt-4 text-gray-700">
              {uploadMessage}
            </p>
          )}

        </div>

        <div className="bg-white rounded-2xl shadow p-6">

          <div className="h-[500px] overflow-y-auto mb-4 border rounded-xl p-4 bg-gray-50">

            {chat.length === 0 && (
              <p className="text-gray-500">
                Ask questions about your uploaded PDFs.
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
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <p className="text-gray-500">
                AI is thinking...
              </p>
            )}

          </div>

          <div className="flex gap-4">

            <input
              type="text"
              placeholder="Ask a question..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
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
              {loading ? "Thinking..." : "Send"}
            </button>

          </div>

        </div>
      </div>
    </main>
  );
}