function drawNumbers() {
  const pool = Array.from({ length: 45 }, (_, i) => i + 1);
  const result = [];
  for (let i = 0; i < 6; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result.sort((a, b) => a - b);
}

function getTodayKorean() {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "full",
    timeZone: "Asia/Seoul",
  }).format(new Date());
}

function buildPrompt(birthDate, numbers, today, userMessage) {
  return `당신은 친근한 로또 운세 챗봇입니다.

오늘 날짜: ${today}
사용자 생년월일: ${birthDate}
추천 로또 번호(6개, 1~45, 변경 금지): ${numbers.join(", ")}

사용자 메시지: ${userMessage}

반드시 아래 JSON 형식으로만 답변하세요. 다른 텍스트는 포함하지 마세요.
{
  "fortune": "오늘의 운세를 1~2문장으로 요약",
  "explanation": "생년월일과 오늘 운세를 바탕으로 위 번호를 추천하는 이유를 3~5문장으로 설명",
  "reply": "사용자에게 전달할 친근한 대화형 답변(번호 목록 포함)"
}

규칙:
- 반드시 한국어
- 사주, 별자리, 오늘의 기운 등을 활용해 창의적으로 연결
- 재미·참고용이며 당첨을 보장하지 않음을 자연스럽게 언급
- 번호는 ${numbers.join(", ")}만 사용하고 변경하지 마세요`;
}

function getApiKey() {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").trim();
}

function parseGeminiError(status, errText) {
  try {
    const err = JSON.parse(errText);
    const message = err.error?.message || "";
    const code = err.error?.code || status;

    if (code === 429 || message.includes("quota") || message.includes("Quota exceeded")) {
      return "AI 사용 한도를 초과했습니다. 1~2분 후 다시 시도하거나 Google AI Studio에서 사용량을 확인해 주세요.";
    }

    if (
      message.includes("API key not valid") ||
      message.includes("API_KEY_INVALID") ||
      code === 401 ||
      code === 403
    ) {
      return "API 키가 올바르지 않습니다. Vercel 환경변수 GEMINI_API_KEY 값을 확인해 주세요.";
    }
  } catch {
    // ignore parse errors
  }

  return "AI 응답을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

function extractJsonObject(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("JSON not found");
  }

  return JSON.parse(trimmed.slice(start, end + 1));
}

async function callGemini(apiKey, contents, useSchema) {
  const generationConfig = useSchema
    ? {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            fortune: { type: "string" },
            explanation: { type: "string" },
            reply: { type: "string" },
          },
          required: ["fortune", "explanation", "reply"],
        },
      }
    : {
        responseMimeType: "application/json",
      };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`;

  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents, generationConfig }),
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." });
  }

  const { birthDate, message, chatHistory = [] } = req.body || {};

  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return res.status(400).json({ error: "올바른 생년월일(YYYY-MM-DD)을 입력해 주세요." });
  }

  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) {
    return res.status(400).json({ error: "유효하지 않은 생년월일입니다." });
  }

  const numbers = drawNumbers();
  const today = getTodayKorean();
  const userMessage =
    typeof message === "string" && message.trim()
      ? message.trim()
      : "오늘의 운세와 제 생년월일을 바탕으로 로또 번호를 추천해 주세요.";

  const contents = [];

  chatHistory.slice(-6).forEach((entry) => {
    if (entry.role === "user") {
      contents.push({ role: "user", parts: [{ text: entry.text }] });
    } else if (entry.role === "assistant") {
      contents.push({ role: "model", parts: [{ text: entry.text }] });
    }
  });

  contents.push({
    role: "user",
    parts: [{ text: buildPrompt(birthDate, numbers, today, userMessage) }],
  });

  try {
    let response = await callGemini(apiKey, contents, true);

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error (structured):", response.status, errText);

      if (response.status === 400) {
        response = await callGemini(apiKey, contents, false);
      } else {
        return res.status(502).json({ error: parseGeminiError(response.status, errText) });
      }
    }

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error (fallback):", response.status, errText);
      return res.status(502).json({ error: parseGeminiError(response.status, errText) });
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return res.status(502).json({ error: "AI 응답이 비어 있습니다." });
    }

    const parsed = extractJsonObject(rawText);

    if (!parsed.fortune || !parsed.explanation || !parsed.reply) {
      return res.status(502).json({ error: "AI 응답 형식이 올바르지 않습니다." });
    }

    return res.status(200).json({
      numbers,
      fortune: parsed.fortune,
      explanation: parsed.explanation,
      reply: parsed.reply,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
};
