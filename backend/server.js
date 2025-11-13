// server.js
import express from "express";
import cron from "node-cron";
import admin from "firebase-admin";
import dotenv from "dotenv";
import cors from "cors";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";

dotenv.config();

// Inicializa express
const app = express();

// ✅ Configuração CORS — permite chamadas do Vercel e localhost
app.use(cors({
  origin: [
    "https://ponto-sorvetao.vercel.app", // seu domínio no Vercel
    "http://localhost:5173", // durante desenvolvimento local (Vite)
  ],
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());

// Configura dayjs com fuso horário de Brasília
dayjs.extend(utc);
dayjs.extend(timezone);
const tz = "America/Sao_Paulo";

// 🔥 Inicializa o Firebase Admin SDK
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const auth = admin.auth();
const PORT = process.env.PORT || 3001;
// ===================================================================
// 🕓 Função: aplica "FOLGA" automaticamente se não houver ponto no dia
// ===================================================================
async function aplicarFolgaAutomatica() {
  console.log("🕓 Iniciando verificação de folgas automáticas...");

  const hoje = dayjs().tz(tz).format("YYYY-MM-DD");
  const agora = dayjs().tz(tz).format("HH:mm:ss");
  console.log(`📅 Data atual: ${hoje} — Hora: ${agora}`);

  try {
    const lojasSnap = await db.collection("lojas").get();

    for (const loja of lojasSnap.docs) {
      const lojaId = loja.id;
      const funcionariosSnap = await db
        .collection("lojas")
        .doc(lojaId)
        .collection("funcionarios")
        .get();

      for (const func of funcionariosSnap.docs) {
        const funcId = func.id;
        const pontoRef = db
          .collection("lojas")
          .doc(lojaId)
          .collection("funcionarios")
          .doc(funcId)
          .collection("pontos")
          .doc(hoje);

        const pontoSnap = await pontoRef.get();

        // ⚙️ Se o ponto não existir ou estiver vazio, aplica FOLGA
        if (!pontoSnap.exists() || !pontoSnap.data()?.status) {
          await pontoRef.set(
            {
              data: hoje,
              status: "FOLGA",
              criadoAutomaticamente: true,
              criadoEm: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
          console.log(`✅ Folga atribuída automaticamente a ${funcId} (loja: ${lojaId})`);
        }
      }
    }

    console.log("✅ Verificação de folgas automáticas concluída!");
  } catch (err) {
    console.error("❌ Erro ao aplicar folgas automáticas:", err);
  }
}
// ===================================================
// 🧩 Rota manual para testar folgas (GET /folgas)
// ===================================================
app.get("/folgas", async (req, res) => {
  try {
    await aplicarFolgaAutomatica();
    res.send("Folgas aplicadas manualmente!");
  } catch (err) {
    console.error("Erro rota /folgas:", err);
    res.status(500).send("Erro ao aplicar folgas.");
  }
});
// ===================================================
// 🕒 Agendamento diário às 16:00 (horário de Brasília)
// ===================================================
cron.schedule(
  "0 16 * * *", // 16h todos os dias
  async () => {
    console.log("⏰ Rodando tarefa de folgas automáticas (16h Brasília)...");
    await aplicarFolgaAutomatica();
  },
  { timezone: "America/Sao_Paulo" } // força o fuso horário correto
);
// ===================================================
// 🗑️ Rota para deletar loja + usuário Firebase
// ===================================================
app.post("/deletar-loja", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "E-mail da loja é obrigatório." });
    }

    console.log(`🗑️ Solicitada exclusão da loja: ${email}`);

    const lojaRef = db.collection("lojas").doc(email);
    const lojaDoc = await lojaRef.get();

    if (!lojaDoc.exists) {
      return res.status(404).json({ error: "Loja não encontrada." });
    }

    const { uid } = lojaDoc.data();

    // 1️⃣ Deleta o documento Firestore da loja
    await lojaRef.delete();
    console.log(`✅ Documento da loja ${email} removido do Firestore.`);

    // 2️⃣ Deleta o usuário do Firebase Authentication
    if (uid) {
      try {
        await auth.deleteUser(uid);
        console.log(`✅ Usuário Firebase com UID ${uid} removido.`);
      } catch (error) {
        console.error("⚠️ Falha ao remover usuário do Firebase:", error);
      }
    } else {
      console.warn("⚠️ Loja sem UID registrado — apenas Firestore foi limpo.");
    }

    res.json({ success: true, message: `Loja ${email} removida com sucesso.` });
  } catch (err) {
    console.error("❌ Erro ao excluir loja:", err);
    res.status(500).json({ error: "Erro interno ao excluir loja." });
  }
});

// ===================================================
// 🚀 Inicializa servidor
// ===================================================
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
