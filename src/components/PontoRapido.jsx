// src/components/PontoRapido.jsx
import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, CircularProgress, Avatar,
} from "@mui/material";
import * as faceapi from "@vladmandic/face-api";
import { db } from "../services/firebase";
import { doc, getDoc, setDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { useFaceApi } from "../contexts/FaceApiContext";

const BRAZIL_TZ = "America/Sao_Paulo";
const MATCH_THRESHOLD = 0.5;
const DETECTION_INTERVAL = 600; // ms entre detecções
const MAX_ATTEMPTS = 20; // ~12 segundos

function getHojeId() {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: BRAZIL_TZ }).format(new Date());
  } catch {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
}

function getHoraAtualLocal() {
  try {
    const hora = new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit", minute: "2-digit", hour12: false, timeZone: BRAZIL_TZ,
    }).format(new Date());
    const parts = hora.split(":").map((s) => s.padStart(2, "0"));
    return `${parts[0]}:${parts[1]}`;
  } catch {
    const agora = new Date();
    return agora.toTimeString().split(":").slice(0, 2).join(":");
  }
}

export default function PontoRapido({ open, onClose, lojaId, funcionarios }) {
  const { modelsLoaded, getCameraStream } = useFaceApi();
  const [status, setStatus] = useState("idle"); // idle | loading | detecting | success | error
  const [mensagem, setMensagem] = useState("");
  const [funcionarioReconhecido, setFuncionarioReconhecido] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const cancelRef = useRef(false);

  // Carrega todos os descritores dos funcionários
  const carregarDescritores = useCallback(async () => {
    const descritores = [];
    for (const func of funcionarios) {
      try {
        const snap = await getDoc(doc(db, "lojas", lojaId, "funcionarios", func.id));
        if (!snap.exists()) continue;
        const data = snap.data();
        if (data.faceDescriptor && Array.isArray(data.faceDescriptor) && data.faceDescriptor.length === 128) {
          descritores.push({
            id: func.id,
            nome: func.nome,
            foto: data.fotoReferencia || null,
            descriptor: new Float32Array(data.faceDescriptor),
          });
        }
      } catch (err) {
        console.warn(`Erro ao carregar descritor de ${func.nome}:`, err);
      }
    }
    return descritores;
  }, [funcionarios, lojaId]);

  const baterPontoAutomatico = useCallback(async (funcId, funcNome) => {
    try {
      const agoraSP = new Date(new Date().toLocaleString("en-US", { timeZone: BRAZIL_TZ }));
      const horaAtual = getHoraAtualLocal();
      const hojeId = getHojeId();

      // Regra de madrugada (00:00 - 04:59 → dia anterior)
      const horaNum = parseInt(horaAtual.split(":")[0]);
      let targetDayId = hojeId;
      let isNightExit = false;

      if (horaNum >= 0 && horaNum < 5) {
        const ontem = new Date(agoraSP);
        ontem.setDate(ontem.getDate() - 1);
        targetDayId = new Intl.DateTimeFormat("en-CA", { timeZone: BRAZIL_TZ }).format(ontem);
        isNightExit = true;
      }

      const docRef = doc(db, "lojas", lojaId, "funcionarios", funcId, "pontos", targetDayId);
      let snap;
      try { snap = await getDoc(docRef, { source: "server" }); } catch { snap = await getDoc(docRef); }

      let dados = snap.exists() ? { ...snap.data() } : { data: targetDayId, status: "OK" };

      if (isNightExit) {
        dados.saida = horaAtual;
      } else if (!dados.entrada) {
        dados.entrada = horaAtual;
      } else if (!dados.intervaloSaida) {
        dados.intervaloSaida = horaAtual;
      } else if (!dados.intervaloVolta) {
        dados.intervaloVolta = horaAtual;
      } else if (!dados.saida) {
        dados.saida = horaAtual;
      } else {
        setStatus("error");
        setMensagem(`⚠️ Todos os pontos de ${funcNome} já foram marcados hoje.`);
        return;
      }

      await setDoc(docRef, dados, { merge: true });

      setFuncionarioReconhecido({ nome: funcNome, foto: null });
      setStatus("success");
      setMensagem(`✅ Ponto registrado para ${funcNome}!`);
    } catch (err) {
      console.error("Erro ao bater ponto:", err);
      setStatus("error");
      setMensagem("Erro ao registrar ponto.");
    }
  }, [lojaId]);

  // Inicia a câmera e o loop de detecção
  const iniciarReconhecimento = useCallback(async () => {
    if (!modelsLoaded) {
      setStatus("error");
      setMensagem("⏳ Modelos ainda carregando...");
      return;
    }

    setStatus("loading");
    setMensagem("Preparando câmera...");
    cancelRef.current = false;

    try {
      const stream = await getCameraStream();
      streamRef.current = stream;

      // Cria elemento de vídeo
      const video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.width = 480;
      video.height = 360;
      video.style.width = "100%";
      video.style.height = "100%";
      video.style.objectFit = "cover";
      video.srcObject = stream;

      videoRef.current = video;

      // Espera o vídeo carregar
      await new Promise((resolve) => {
        video.onloadeddata = resolve;
        setTimeout(resolve, 2000);
      });

      setStatus("detecting");
      setMensagem("🔍 Procurando rosto...");

      // Carrega descritores
      const descritores = await carregarDescritores();
      if (descritores.length === 0) {
        setStatus("error");
        setMensagem("Nenhum funcionário com face cadastrada.");
        return;
      }

      // Loop de detecção
      let tentativas = 0;
      let matched = false;

      while (tentativas < MAX_ATTEMPTS && !matched && !cancelRef.current) {
        try {
          const det = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (det?.descriptor) {
            // Compara com todos os funcionários
            let melhorDistancia = Infinity;
            let melhorFunc = null;

            for (const d of descritores) {
              const dist = faceapi.euclideanDistance(d.descriptor, det.descriptor);
              if (dist < melhorDistancia) {
                melhorDistancia = dist;
                melhorFunc = d;
              }
            }

            console.log(`Distância: ${melhorDistancia.toFixed(3)} → ${melhorFunc?.nome}`);

            if (melhorDistancia < MATCH_THRESHOLD) {
              matched = true;
              await baterPontoAutomatico(melhorFunc.id, melhorFunc.nome);
              break;
            }
          }
        } catch (err) {
          console.warn("Erro na detecção:", err);
        }

        tentativas++;
        await new Promise((r) => setTimeout(r, DETECTION_INTERVAL));
      }

      if (!matched && !cancelRef.current) {
        setStatus("error");
        setMensagem("😕 Nenhum funcionário reconhecido. Tente novamente.");
      }
    } catch (err) {
      console.error("Erro no reconhecimento:", err);
      setStatus("error");
      setMensagem("Erro ao abrir câmera.");
    }
  }, [modelsLoaded, getCameraStream, carregarDescritores, baterPontoAutomatico]);

  // Inicia quando o dialog abre
  useEffect(() => {
    if (open) {
      const timer = setTimeout(iniciarReconhecimento, 300);
      return () => {
        clearTimeout(timer);
        cancelRef.current = true;
        // 🔥 NÃO para o stream — mantém a câmera pré-aquecida no contexto global
        // Só remove o elemento <video> da tela
        if (videoRef.current && videoRef.current.parentNode) {
          videoRef.current.parentNode.removeChild(videoRef.current);
        }
        videoRef.current = null;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleClose = () => {
    cancelRef.current = true;
    // 🔥 NÃO para o stream — mantém a câmera pré-aquecida
    if (videoRef.current && videoRef.current.parentNode) {
      videoRef.current.parentNode.removeChild(videoRef.current);
    }
    videoRef.current = null;
    setStatus("idle");
    setMensagem("");
    setFuncionarioReconhecido(null);
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>🕐 Bater Ponto Rápido</DialogTitle>
      <DialogContent>
        <Box sx={{ position: "relative", width: "100%", height: 300, bgcolor: "#000", borderRadius: 2, overflow: "hidden" }}>
          {status === "detecting" && videoRef.current && (
            <Box
              ref={(el) => { if (el && videoRef.current && !el.contains(videoRef.current)) el.appendChild(videoRef.current); }}
              sx={{ width: "100%", height: "100%" }}
            />
          )}

          {status === "loading" && (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#fff", gap: 2 }}>
              <CircularProgress color="inherit" />
              <Typography>{mensagem}</Typography>
            </Box>
          )}

          {status === "success" && (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#4caf50", gap: 2 }}>
              <Avatar sx={{ width: 80, height: 80, bgcolor: "#4caf50" }}>✓</Avatar>
              <Typography variant="h6">{mensagem}</Typography>
            </Box>
          )}

          {status === "error" && (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#ff9800", gap: 2, p: 2 }}>
              <Typography align="center">{mensagem}</Typography>
            </Box>
          )}

          {status === "idle" && (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#aaa", gap: 2 }}>
              <Typography>Clique em "Iniciar" para abrir a câmera</Typography>
            </Box>
          )}
        </Box>

        {status === "detecting" && (
          <Typography align="center" sx={{ mt: 2, color: "#aaa" }}>
            Olhe para a câmera e aguarde o reconhecimento...
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        {status === "idle" && (
          <Button variant="contained" color="success" onClick={iniciarReconhecimento}>
            Iniciar
          </Button>
        )}
        <Button onClick={handleClose} color="inherit">
          Fechar
        </Button>
      </DialogActions>
    </Dialog>
  );
}