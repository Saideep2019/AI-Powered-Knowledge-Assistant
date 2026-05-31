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

  const deleteDocument = async (
    filename: string
  ) => {

    try {

      const response = await fetch(
        `http://127.0.0.1:8000/documents/${filename}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        throw new Error(
          "Failed to delete document"
        );
      }

      // Remove document from dropdown list
      setDocuments((prev) =>
        prev.filter(
          (doc) => doc !== filename
        )
      );

      // Clear selection if deleted document
      if (selectedDocument === filename) {
        setSelectedDocument("");
      }

    } catch (error) {

      console.error(error);
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
    <main className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-8">

      <div className="max-w-7xl mx-auto">

        <div className="text-center mb-10">

          <h1 className="text-6xl font-extrabold text-white mb-2">
            AI Knowledge Assistant
          </h1>

          <p className="text-white/80 text-lg">
            Upload documents. Ask questions. Get answers.
          </p>

        </div>


        {/* Upload Section */}
        <div className="bg-white/15 backdrop-blur-lg border border-white/20 p-6 rounded-3xl shadow-2xl mb-8">

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

           className="
            block
            w-full
            bg-white
            text-slate-800
            border
            border-slate-300
            p-3
            rounded-xl
            mb-4
            shadow-md
            "
          />

          {file && (
            <p className="mb-4 text-sm text-green-600">
              Selected: {file.name}
            </p>
          )}

          <button
            onClick={handleUpload}
            className="
            bg-gradient-to-r
            from-indigo-600
            to-purple-600
            text-white
            px-6
            py-3
            rounded-xl
            hover:scale-105
            transition
            duration-200
            "
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
        <div className="bg-white/15 backdrop-blur-lg border border-white/20 p-4 rounded-3xl shadow-2xl mb-6">

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

        <div className="mt-4">

          <h3 className="font-semibold mb-2">
            Uploaded Documents
          </h3>

          {documents.map((doc) => (

            <div
              key={doc}
              className="
              flex
              justify-between
              items-center
              bg-white
              rounded-xl
              shadow-md
              p-3
              mb-3
              "
            >

              <span>{doc}</span>

              <button
                onClick={() =>
                  deleteDocument(doc)
                }
               className="
                bg-gradient-to-r
                from-red-500
                to-pink-500
                text-white
                px-3
                py-1
                rounded-lg
                hover:scale-105
                transition
                "
              >
                Delete
              </button>

            </div>

          ))}

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

                className={`mb-4 flex ${msg.role === "user"
                  ? "justify-end"
                  : "justify-start"
                  }`}
              >

                <div
                  className={`max-w-[80%] px-4 py-3 rounded-2xl ${msg.role === "user"
                    ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white"
                    : "bg-white text-slate-800 shadow-lg"
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

              className="
              bg-gradient-to-r
              from-purple-600
              to-pink-600
              text-white
              px-6
              rounded-xl
              hover:scale-105
              transition
              duration-200
              disabled:opacity-50
              "
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