"use client";

import { useEffect, useState, useRef } from "react";

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


type Conversation = {
  id: string;
  title: string;
  messages: Message[];
};






export default function Home() {

  const [file, setFile] =
    useState<File | null>(null);

  const fileInputRef =
    useRef<HTMLInputElement>(null);

  const [isSummarizing, setIsSummarizing] =
    useState(false);

  const [summary, setSummary] = useState("");

  const [documents, setDocuments] =
    useState<string[]>([]);

  const [selectedDocument, setSelectedDocument] =
    useState("");

  const [uploadMessage, setUploadMessage] =
    useState("");

  const [question, setQuestion] =
    useState("");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string>("");

  const [loading, setLoading] =
    useState(false);

  const [quiz, setQuiz] =
    useState<any[]>([]);

  const [currentQuestion, setCurrentQuestion] =
    useState(0);

  const [selectedAnswer, setSelectedAnswer] =
    useState("");

  const [showResult, setShowResult] =
    useState(false);

  const [score, setScore] =
    useState(0);

  const [activeTab, setActiveTab] =
    useState("chat");

  const [flashcards,
    setFlashcards]
    = useState<any[]>([]);

  const [currentCard,
    setCurrentCard]
    = useState(0);

  const [showBack,
    setShowBack]
    = useState(false);







  // -----------------------------
  // Fetch Uploaded PDFs
  // -----------------------------
  const fetchDocuments = async () => {

    try {

      const response = await fetch(
        "http://127.0.0.1:8000/documents"
      );

      const data = await response.json();
      console.log("SUMMARY RESPONSE:");
      console.log(data);
      console.log(data.summary);

      setDocuments(data.documents);

    } catch (error) {

      console.error(error);
    }
  };







  const createNewChat = () => {

    const newChat: Conversation = {
      id: crypto.randomUUID(),
      title: "New Chat",
      messages: [],
    };

    setConversations((prev) => [
      newChat,
      ...prev,
    ]);

    setActiveChatId(newChat.id);

    // Return to the chat view
    setActiveTab("chat");

    // Clear any quiz state
    setQuiz([]);
    setCurrentQuestion(0);
    setSelectedAnswer("");
    setShowResult(false);
    setScore(0);

    // Clear flashcards
    setFlashcards([]);
    setCurrentCard(0);
    setShowBack(false);

    // Clear summary
    setSummary("");
  };


  const generateFlashcards = async () => {

    if (!selectedDocument) {

      alert(
        "Please select a document."
      );

      return;
    }

    try {

      const response = await fetch(
        "http://127.0.0.1:8000/generate-flashcards",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            document:
              selectedDocument,
          }),
        }
      );

      const data =
        await response.json();

      console.log(
        "FLASHCARDS:"
      );

      console.log(data);

      setFlashcards(
        data.flashcards
      );

      setCurrentCard(0);

      setShowBack(false);

    } catch (error) {

      console.error(error);

    }
  };




  const activeConversation = conversations.find(
    (c) => c.id === activeChatId
  );


  const deleteConversation = (id: string) => {

    const updated =
      conversations.filter(
        (conv) => conv.id !== id
      );

    setConversations(updated);

    if (updated.length > 0) {
      setActiveChatId(updated[0].id);
    } else {
      createNewChat();
    }
  };



  // -----------------------------
  // Load Documents on Startup
  // -----------------------------
  useEffect(() => {
    fetchDocuments();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("conversations");

    if (saved) {
      const parsed = JSON.parse(saved);

      setConversations(parsed);

      if (parsed.length > 0) {
        setActiveChatId(parsed[0].id);
      }
    }
  }, []);


  useEffect(() => {
    localStorage.setItem(
      "conversations",
      JSON.stringify(conversations)
    );
  }, [conversations]);



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
    const history =
      activeConversation?.messages.map(
        (msg) => ({
          role: msg.role,
          content: msg.content,
        })
      ) || [];

    const userMessage: Message = {
      role: "user",
      content: currentQuestion,
    };



    const title =
      currentQuestion.length > 35
        ? currentQuestion.slice(0, 35) + "..."
        : currentQuestion;

    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === activeChatId
          ? {
            ...conv,
            title:
              conv.title === "New Chat"
                ? title
                : conv.title,
            messages: [
              ...conv.messages,
              userMessage,
            ],
          }
          : conv
      )
    );

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
            history,
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

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === activeChatId
            ? {
              ...conv,
              messages: [
                ...conv.messages,
                aiMessage,
              ],
            }
            : conv
        )
      );

    } catch (error) {

      console.error(error);

      const errorMessage: Message = {
        role: "assistant",
        content:
          "Error getting AI response.",
      };

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === activeChatId
            ? {
              ...conv,
              messages: [
                ...conv.messages,
                errorMessage,
              ],
            }
            : conv
        )
      );
    }

    setLoading(false);
  };

  const generateQuiz = async () => {



    if (!selectedDocument) {
      alert(
        "Please select a document."
      );
      return;
    }

    const response = await fetch(
      "http://127.0.0.1:8000/generate-quiz",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          document:
            selectedDocument,
        }),
      }
    );

    const data =
      await response.json();


    console.log("QUIZ DATA:");
    console.log(data);

    console.log("QUIZ ARRAY:");
    console.log(data.quiz);

    console.log("FIRST QUESTION:");
    console.log(data.quiz[0]);
    setQuiz(data.quiz);
    setCurrentQuestion(0);
    setSelectedAnswer("");
    setShowResult(false);
    setScore(0);
    setActiveTab("quiz");
  };
  const checkAnswer = (
    answer: string
  ) => {

    setSelectedAnswer(answer);

    setShowResult(true);

    if (
      answer ===
      quiz[currentQuestion].answer
    ) {
      setScore(
        prev => prev + 1
      );
    }
  };

  const nextQuestion = () => {

    setCurrentQuestion(
      prev => prev + 1
    );

    setSelectedAnswer("");

    setShowResult(false);
  };







  const summarizeDocument = async () => {

    if (!selectedDocument) {
      alert("Please select a document first.");
      return;
    }

    try {

      setIsSummarizing(true);

      const response = await fetch(
        "http://127.0.0.1:8000/summarize",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            document: selectedDocument,
          }),
        }
      );

      const data = await response.json();
      setSummary(data.summary);
      setActiveTab("summary");

      const summaryMessage: Message = {
        role: "assistant",
        content: data.summary,
      };



      console.log("Summary received:");
      console.log(data);

      console.log("Summary text:");
      console.log(data.summary);

      console.log("Active Chat ID:");
      console.log(activeChatId);

      console.log("Conversation IDs:");
      console.log(
        conversations.map(c => c.id)
      );
      console.log("Adding summary to conversation");
      console.log(summaryMessage);

      setConversations((prev) => {

        const targetId =
          activeChatId || prev[0]?.id;

        return prev.map((conv) =>
          conv.id === targetId
            ? {
              ...conv,
              messages: [
                ...conv.messages,
                summaryMessage,
              ],
            }
            : conv
        );
      });

    } catch (error) {

      console.error(error);

    } finally {

      setIsSummarizing(false);

    }
  };


  return (
    <main className="min-h-screen flex bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500">
      <aside
        className="
    w-72
    border-r
    border-white/20
    bg-black/20
    backdrop-blur-lg
    p-4
    flex
    flex-col
  "
      >

        <button
          onClick={createNewChat}
          className="
      w-full
      bg-green-500
      text-white
      px-4
      py-3
      rounded-lg
      mb-4
    "
        >
          + New Chat
        </button>

        <div className="space-y-3 mb-6">

          <button
            onClick={summarizeDocument}
            className="
        w-full
        bg-blue-600
        text-white
        px-4
        py-3
        rounded-lg
      "
          >
            📄 Generate Summary
          </button>

          <button
            onClick={generateQuiz}
            className="
        w-full
        bg-green-600
        text-white
        px-4
        py-3
        rounded-lg
      "
          >
            📝 Generate Quiz
          </button>

          <button
            onClick={generateFlashcards}
            className="
    w-full
    bg-purple-600
    text-white
    px-4
    py-3
    rounded-lg
  "
          >
            🧠 Generate Flashcards
          </button>

        </div>

        <hr
          className="
      border-white/20
      my-4
    "
        />

        <h3
          className="
      text-white
      text-sm
      font-semibold
      mb-3
    "
        >
          Recent Chats
        </h3>

        <div className="space-y-2">

          {conversations.map((conv) => (

            <div
              key={conv.id}
              className="
          flex
          items-center
          gap-2
        "
            >

              <button
                onClick={() =>
                  setActiveChatId(conv.id)
                }
                className={`
            flex-1
            text-left
            p-3
            rounded-lg
            text-white
            ${activeChatId === conv.id
                    ? "bg-white/30"
                    : "bg-white/10"
                  }
          `}
              >
                {conv.title}
              </button>

              <button
                onClick={() =>
                  deleteConversation(conv.id)
                }
                className="
            px-3
            py-2
            rounded-lg
            bg-red-500
            text-white
          "
              >
                ×
              </button>

            </div>

          ))}

        </div>

      </aside>

      <div className="flex-1 p-8 overflow-auto">

        <div className="text-center mb-10">

          <h1 className="text-6xl font-extrabold text-white mb-2">
            DocuMind
          </h1>
          <p className="text-white/80 text-lg">
            Upload documents. Ask questions. Get answers.
          </p>




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


          {activeTab === "summary" &&
            summary && (
              <div className="mt-4 p-4 bg-white rounded-xl">
                <h3 className="font-bold mb-2">
                  Document Summary
                </h3>

                <p className="whitespace-pre-wrap">
                  {summary}
                </p>
              </div>


            )}

          {activeTab === "quiz" &&
            quiz.length > 0 &&
            currentQuestion < quiz.length && (

              <div className="mt-4 p-4 bg-white rounded-xl">

                <h3 className="font-bold mb-4">
                  Question {currentQuestion + 1}
                  {" "}of{" "}
                  {quiz.length}
                </h3>

                <p className="mb-4">
                  {quiz[currentQuestion].question}
                </p>

                {Object.entries(
                  quiz[currentQuestion].options
                ).map(([key, value]) => (

                  <button
                    key={key}
                    onClick={() =>
                      checkAnswer(key)
                    }
                    disabled={showResult}
                    className="
          block
          w-full
          text-left
          border
          p-2
          mb-2
          rounded
          hover:bg-gray-100
        "
                  >
                    {key}) {String(value)}
                  </button>

                ))}

                {showResult && (

                  <div className="mt-4">

                    <div className="font-semibold">

                      {selectedAnswer ===
                        quiz[currentQuestion]
                          .answer
                        ? "✅ Correct!"
                        : "❌ Incorrect!"}

                    </div>

                    <div className="mt-2">

                      Correct Answer:

                      {" "}

                      {quiz[currentQuestion]
                        .answer}

                    </div>

                    <button
                      onClick={nextQuestion}
                      className="
            mt-4
            bg-blue-600
            text-white
            px-4
            py-2
            rounded
          "
                    >
                      Next Question
                    </button>

                  </div>

                )}

              </div>

            )}


          {activeTab === "quiz" &&
            quiz.length > 0 &&
            currentQuestion >= quiz.length && (

              <div
                className="
      mt-4
      p-4
      bg-white
      rounded-xl
    "
              >

                <h3 className="font-bold">
                  Quiz Complete 🎉
                </h3>

                <p className="mt-2">
                  Score:
                  {" "}
                  {score}
                  /
                  {quiz.length}
                </p>

              </div>

            )}



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





        <div className="mt-8"></div>
        {/* Chat Section */}
        {activeTab === "chat" && (
          <div className="bg-white rounded-2xl shadow p-6">

            <div className="h-[500px] overflow-y-auto mb-4 border rounded-xl p-4 bg-gray-50">

              {(!activeConversation ||
                activeConversation.messages.length === 0) && (
                  <p className="text-gray-500">
                    Ask questions about your PDFs.
                  </p>
                )}

              {activeConversation?.messages.map((msg, index) => (

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




            {flashcards.length > 0 && (

              <div
                className="
      mt-6
      bg-white
      rounded-2xl
      p-6
      shadow-lg
    "
              >

                <h3
                  className="
        font-bold
        mb-4
      "
                >
                  Flashcard
                  {" "}
                  {currentCard + 1}
                  /
                  {flashcards.length}
                </h3>

                <div
                  className="
        min-h-[150px]
        flex
        items-center
        justify-center
        text-center
        text-lg
      "
                >

                  {showBack
                    ? flashcards[currentCard].back
                    : flashcards[currentCard].front}

                </div>

                <div
                  className="
    flex
    justify-center
    gap-3
    mt-4
  "
                >

                  <button
                    onClick={() =>
                      setShowBack(
                        !showBack
                      )
                    }
                    className="
      bg-indigo-600
      text-white
      px-4
      py-2
      rounded-lg
    "
                  >
                    {showBack
                      ? "Show Front"
                      : "Show Back"}
                  </button>

                  <button
                    onClick={() => {

                      if (
                        currentCard > 0
                      ) {

                        setCurrentCard(
                          currentCard - 1
                        );

                        setShowBack(false);

                      }

                    }}
                    disabled={
                      currentCard === 0
                    }
                    className="
      bg-gray-600
      text-white
      px-4
      py-2
      rounded-lg
      disabled:opacity-50
    "
                  >
                    ← Previous
                  </button>

                  <button
                    onClick={() => {

                      if (
                        currentCard <
                        flashcards.length - 1
                      ) {

                        setCurrentCard(
                          currentCard + 1
                        );

                        setShowBack(false);

                      }

                    }}
                    disabled={
                      currentCard ===
                      flashcards.length - 1
                    }
                    className="
      bg-green-600
      text-white
      px-4
      py-2
      rounded-lg
      disabled:opacity-50
    "
                  >
                    Next →
                  </button>

                </div>

              </div>

            )}

            {/* Input */}
            <div className="flex gap-3 items-center">

              <button
                onClick={() => {

                  fileInputRef.current?.click();

                  console.log(
                    "Upload button clicked"
                  );

                }}

                className="
    w-12
    h-12
    rounded-full
    bg-white
    text-black
    text-2xl
    flex
    items-center
    justify-center
    shadow-lg
    hover:scale-105
    transition
  "
              >
                +
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"

                onChange={(e) => {

                  const selectedFile =
                    e.target.files?.[0];

                  if (!selectedFile) return;

                  const formData =
                    new FormData();

                  formData.append(
                    "file",
                    selectedFile
                  );

                  fetch(
                    "http://127.0.0.1:8000/upload",
                    {
                      method: "POST",
                      body: formData,
                    }
                  )
                    .then(() =>
                      fetchDocuments()
                    )
                    .catch(console.error);

                }}
              />

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

                className="
      flex-1
      border
      p-3
      rounded-xl
    "
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
      py-3
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
        )}
      </div>

    </main>


  );
}