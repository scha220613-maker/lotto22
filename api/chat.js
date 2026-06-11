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

다음 JSON 형식으로만 답변하세요:
{
  "fortune": "오늘의 운세를 1~2문장으로 요약",
  "explanation": "생년월일과 오늘 운세를 바탕으로 위 번호 각각 또는 전체를 추천하는 이유를 3~5문장으로 설명",
  "reply": "사용자에게 전달할 친근한 대화형 답변(번호 목록 포함)"
}

규칙:
- 반드시 한국어
- 사주, 별자리, 오늘의 기운 등을 활용해 창의적으로 연결
- 재미·참고용이며 당첨을 보장하지 않음을 자연스럽게 언급
- numbers 배열 값은 절대 바꾸지 마세요`;
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

  const apiKey = process.env.GEMINI_API_KEY;
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
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
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
          },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return res.status(502).json({ error: "AI 응답을 가져오지 못했습니다." });
    }

    const data = await response.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return res.status(502).json({ error: "AI 응답이 비어 있습니다." });
    }

    const parsed = JSON.parse(rawText);

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
