
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const http = require("http");
const https = require("https");

const app = express();
const PORT = 3000;
const JWT_SECRET = "pathfinder-secret-key-2025";

app.use(cors());
app.use(express.json());

const users = new Map();
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(auth.split(" ")[1], JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), users: users.size });
});


app.post("/api/auth/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: "All fields required" });
  if (password.length < 6)
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  if (users.has(username))
    return res.status(409).json({ error: "Username already exists" });
  // Check email uniqueness
  for (const u of users.values()) {
    if (u.email === email) return res.status(409).json({ error: "Email already registered" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  users.set(username, { username, email, passwordHash, reports: [], createdAt: new Date().toISOString() });

  const token = jwt.sign({ username, email }, JWT_SECRET, { expiresIn: "7d" });
  res.status(201).json({ token, username, email, message: "Account created!" });
});
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username and password required" });

  const user = users.get(username);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign({ username, email: user.email }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, username, email: user.email, message: "Welcome back!" });
});
app.get("/api/auth/me", authMiddleware, (req, res) => {
  const user = users.get(req.user.username);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ username: user.username, email: user.email, reportCount: user.reports.length, createdAt: user.createdAt });
});
app.post("/api/analyse", authMiddleware, (req, res) => {
  const { answers, apiKey } = req.body;
  if (!answers) return res.status(400).json({ error: "Answers required" });

  if (!apiKey || apiKey.trim() === "") {
    
    const result = offlineResult(answers);
    saveReport(req.user.username, answers, result);
    return res.json({ result, mode: "offline" });
  }

  
  const prompt = buildPrompt(answers);
  const body = JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }]
  });

  const options = {
    hostname: "api.anthropic.com",
    path: "/v1/messages",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey.trim(),
      "anthropic-version": "2023-06-01",
      "Content-Length": Buffer.byteLength(body)
    }
  };

  const apiReq = https.request(options, (apiRes) => {
    let data = "";
    apiRes.on("data", chunk => data += chunk);
    apiRes.on("end", () => {
      if (apiRes.statusCode !== 200) {
        // Fallback to offline
        const result = offlineResult(answers);
        saveReport(req.user.username, answers, result);
        return res.json({ result, mode: "offline", warning: "API error, used offline mode" });
      }
      try {
        const parsed = JSON.parse(data);
        const result = parsed.content?.[0]?.text || "No response received.";
        saveReport(req.user.username, answers, result);
        res.json({ result, mode: "ai" });
      } catch {
        const result = offlineResult(answers);
        saveReport(req.user.username, answers, result);
        res.json({ result, mode: "offline" });
      }
    });
  });

  apiReq.on("error", () => {
    const result = offlineResult(answers);
    saveReport(req.user.username, answers, result);
    res.json({ result, mode: "offline", warning: "Network error, used offline mode" });
  });

  apiReq.write(body);
  apiReq.end();
});
app.get("/api/reports", authMiddleware, (req, res) => {
  const user = users.get(req.user.username);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ reports: user.reports });
});
app.delete("/api/reports/:id", authMiddleware, (req, res) => {
  const user = users.get(req.user.username);
  if (!user) return res.status(404).json({ error: "User not found" });
  user.reports = user.reports.filter(r => r.id !== req.params.id);
  res.json({ success: true });
});
function saveReport(username, answers, result) {
  const user = users.get(username);
  if (!user) return;
  user.reports.unshift({
    id: Date.now().toString(),
    date: new Date().toISOString(),
    stream: answers.stream || "?",
    result
  });
  if (user.reports.length > 10) user.reports = user.reports.slice(0, 10);
}

function buildPrompt(a) {
  return `You are an expert Indian career counsellor. A Class 12 student completed this assessment:

Stream: ${a.stream || "?"}
Favourite subject: ${a.subject || "?"}
Interest areas: ${a.interests || "?"}
Work style: ${a.work_style || "?"}
Strong skills: ${a.skills || "?"}
Salary vs passion (1-10): ${a.salary_passion || 5}
Willing to study: ${a.study_years || "?"} more years
Location: ${a.location || "?"}
Role model type: ${a.role_model || "?"}
Biggest worry: "${a.biggest_fear || "none"}"

Give a detailed career guidance report with:
1. TOP 3 CAREER MATCHES - for each: career name, why it fits, entrance exams needed, average salary
2. STEP-BY-STEP ROADMAP - 4 steps from now to career launch
3. PERSONAL ADVICE - honest 3-paragraph advice addressing their worry

Be specific, warm, and practical. Mention Indian entrance exams (JEE/NEET/CAT/CLAT etc.) where relevant.`;
}

function offlineResult(a) {
  const stream = a.stream || "";
  const interests = a.interests || "";
  let career1, career2, career3, exams;

  if (stream === "PCM") {
    career1 = "Software Engineer"; career2 = "Data Scientist"; career3 = "Civil Engineer";
    exams = "JEE Main, JEE Advanced, BITSAT";
  } else if (stream === "PCB") {
    career1 = "Doctor (MBBS)"; career2 = "Pharmacist"; career3 = "Biomedical Researcher";
    exams = "NEET-UG, AIIMS";
  } else if (stream === "Commerce") {
    career1 = "Chartered Accountant"; career2 = "MBA / Business Analyst"; career3 = "Investment Banker";
    exams = "CA Foundation (ICAI), CAT, XAT";
  } else {
    career1 = "Lawyer / Advocate"; career2 = "Journalist / Media Professional"; career3 = "Civil Services (IAS/IPS)";
    exams = "CLAT, AILET, UPSC CSE";
  }

  return `TOP 3 CAREER MATCHES

★ #1  ${career1}
Great fit based on your ${stream} background.
Exams: ${exams}
Salary: ₹6–25 LPA (entry to senior level)

★ #2  ${career2}
Matches your interests: ${interests || "varied"}
Salary: ₹5–20 LPA

★ #3  ${career3}
A strong alternative path.
Salary: ₹4–18 LPA

STEP-BY-STEP ROADMAP

1. NOW       → Research entrance exams for your top choice
2. YEAR 1-2  → Prepare & appear for entrance exams
3. YEAR 2-4  → Complete undergraduate degree + internships
4. YEAR 5+   → Specialise, build experience, launch career

PERSONAL ADVICE

You have made a great start by taking this assessment. The fact that you are thinking carefully about your career at this stage puts you ahead of most students your age.

Your chosen stream opens multiple doors. Focus on your strengths, stay consistent with your studies, and do not let pressure from others distract you from what genuinely excites you.

Connect your API key for a full personalised AI analysis tailored to your exact profile.`;
}

app.listen(PORT, () => {
  console.log(`\n  🚀 PathFinder Backend running at http://localhost:${PORT}`);
  console.log(`  📡 API endpoints:`);
  console.log(`     POST /api/auth/register`);
  console.log(`     POST /api/auth/login`);
  console.log(`     GET  /api/auth/me`);
  console.log(`     POST /api/analyse`);
  console.log(`     GET  /api/reports`);
  console.log(`     DELETE /api/reports/:id\n`);
});
