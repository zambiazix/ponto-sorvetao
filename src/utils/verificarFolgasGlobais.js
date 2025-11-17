import { db } from "../services/firebase";
import {
  collection,
  getDocs,
  doc,
  setDoc,
} from "firebase/firestore";
import dayjs from "dayjs";

const BRAZIL_TZ = "America/Sao_Paulo";

export async function verificarFolgasGlobais() {
  try {
    // horário atual SP
    const agora = new Date(new Date().toLocaleString("en-US", { timeZone: BRAZIL_TZ }));
    const hora = agora.getHours();

    // só roda após 16h
    if (hora < 16) {
      return;
    }

    const hoje = dayjs().tz(BRAZIL_TZ).format("YYYY-MM-DD");

    console.log("🕓 Rodando varredura global — hoje:", hoje);

    const lojasSnap = await getDocs(collection(db, "lojas"));

    for (const loja of lojasSnap.docs) {
      const lojaId = loja.id;

      const funcsSnap = await getDocs(
        collection(db, "lojas", lojaId, "funcionarios")
      );

      for (const f of funcsSnap.docs) {
        const funcId = f.id;

        const pontoRef = doc(
          db,
          "lojas",
          lojaId,
          "funcionarios",
          funcId,
          "pontos",
          hoje
        );

        const pontoSnap = await getDocs(
          collection(db, "lojas", lojaId, "funcionarios", funcId, "pontos")
        );

        // Verifica ponto do dia
        const docSnap = await pontoRef.get?.() ?? null;

        let dados = docSnap?.exists() ? docSnap.data() : null;

        const nenhumPonto =
          !dados ||
          (!dados.entrada &&
            !dados.intervaloSaida &&
            !dados.intervaloVolta &&
            !dados.saida);

        if (nenhumPonto) {
          await setDoc(
            pontoRef,
            {
              data: hoje,
              status: "FOLGA",
              criadoAutomaticamente: true,
              criadoEm: new Date().toISOString(),
            },
            { merge: true }
          );

          console.log(`✔️ Folga aplicada → ${funcId} (loja: ${lojaId})`);
        }
      }
    }

    console.log("✅ Varredura global concluída!");
  } catch (err) {
    console.error("❌ Erro na varredura global:", err);
  }
}
