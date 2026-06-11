function validateSignup(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";

  if (name.length < 2 || name.length > 20) {
    return { error: "이름을 2~20자로 입력해 주세요." };
  }

  const phoneDigits = phone.replace(/\D/g, "");
  if (!/^01[016789]\d{7,8}$/.test(phoneDigits)) {
    return { error: "올바른 전화번호를 입력해 주세요." };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 60) {
    return { error: "올바른 이메일을 입력해 주세요." };
  }

  return {
    data: {
      name,
      phone: phoneDigits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3"),
      email: email.toLowerCase(),
    },
  };
}

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    ""
  ).trim();

  if (!url || !serviceRoleKey) {
    return null;
  }

  return { url, serviceRoleKey };
}

function parseSupabaseError(status, errText) {
  try {
    const err = JSON.parse(errText);
    const code = err.code || "";
    const message = err.message || "";

    if (status === 401 || message.toLowerCase().includes("invalid api key")) {
      return "Supabase API 키가 올바르지 않습니다. Vercel에 SUPABASE_SERVICE_ROLE_KEY(service_role secret)를 설정해 주세요.";
    }

    if (
      code === "PGRST205" ||
      code === "42P01" ||
      message.includes("Could not find the table") ||
      message.includes("relation \"public.signups\" does not exist")
    ) {
      return "signups 테이블이 없습니다. Supabase SQL Editor에서 supabase/schema.sql을 실행해 주세요.";
    }

    if (
      status === 403 ||
      code === "42501" ||
      message.toLowerCase().includes("permission denied")
    ) {
      return "Supabase 저장 권한이 없습니다. schema.sql을 다시 실행해 주세요.";
    }
  } catch {
    // ignore JSON parse errors
  }

  return "가입 정보 저장에 실패했습니다. Supabase 설정을 확인한 뒤 다시 시도해 주세요.";
}

async function saveToSupabase(signup) {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  const response = await fetch(`${config.url}/rest/v1/signups`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      name: signup.name,
      phone: signup.phone,
      email: signup.email,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Supabase insert error:", response.status, errText);

    if (response.status === 409) {
      throw new Error("DUPLICATE_EMAIL");
    }

    const error = new Error("SUPABASE_INSERT_FAILED");
    error.userMessage = parseSupabaseError(response.status, errText);
    throw error;
  }
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

  const result = validateSignup(req.body || {});
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  if (!getSupabaseConfig()) {
    return res.status(500).json({
      error:
        "Supabase 환경변수가 설정되지 않았습니다. SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY를 확인해 주세요.",
    });
  }

  try {
    await saveToSupabase(result.data);

    return res.status(200).json({
      success: true,
      message: "가입 신청이 완료되었습니다.",
    });
  } catch (error) {
    if (error.message === "DUPLICATE_EMAIL") {
      return res.status(409).json({ error: "이미 가입된 이메일입니다." });
    }

    return res.status(500).json({
      error: error.userMessage || "가입 정보 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }
};
