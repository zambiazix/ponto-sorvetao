// FuncionarioPerfil.jsx
import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { auth, db } from "../services/firebase";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  updateDoc,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import {
  Container,
  Box,
  Typography,
  Button,
  Avatar,
  Paper,
  Stack,
  Divider,
  CircularProgress,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddAPhotoIcon from "@mui/icons-material/AddAPhoto";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import CancelIcon from "@mui/icons-material/Cancel";
import PhotoCamera from "@mui/icons-material/PhotoCamera";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import EditIcon from "@mui/icons-material/Edit";
import { uploadImage } from "../services/cloudinary";
import WebcamCapture from "../components/WebcamCapture";
import * as faceapi from "@vladmandic/face-api";
import {
  loadFaceApiModels,
  getFaceDescriptorFromMedia,
  descriptorToArray,
  arrayToDescriptor,
  compareDescriptors,
  createImageElementFromDataUrl,
} from "../utils/faceRecognition";
// PDF libs
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ConsentDialogs from "../components/ConsentDialogs"; // ajuste o path conforme sua estrutura

// NOTE: você já modularizou utils (recomendado). Estou usando esses imports:
import { parseTimeToMinutes, minutesDiff, overlapMinutesWithWindow } from "../utils/timeUtils";
import { computeMonthlyPayroll, formatDateToDDMM } from "../utils/payroll";

const ADMIN_UID = "mD3ie8YGmgaup2VVDpKuMBltXgp2";
const THRESHOLD = 0.55;
const BRAZIL_TZ = "America/Sao_Paulo";
// localStorage key for regional holidays config
const LS_KEY_REGIONAIS = "ponto_feriados_regionais_v1";

// Função para gerar e salvar descriptor a partir da fotoReferencia
async function gerarEDepositarFaceDescriptor(lojaId, funcionarioId, fotoUrl) {
  try {
    console.log("🔍 Gerando descriptor facial para:", funcionarioId);
    if (!fotoUrl) throw new Error("Sem fotoReferencia disponível.");

    // Garante modelos carregados
    const MODEL_URL = "/models";
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);

    const img = await faceapi.fetchImage(fotoUrl);
    const detection = await faceapi
      .detectSingleFace(img, new faceapi.SsdMobilenetv1Options())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection || !detection.descriptor) {
      console.warn("❌ Nenhum rosto detectado na imagem de referência!");
      return null;
    }

    const descArray = Array.from(detection.descriptor);
    await setDoc(
      doc(db, "lojas", lojaId, "funcionarios", funcionarioId),
      { faceDescriptor: descArray, updatedAt: new Date().toISOString() },
      { merge: true }
    );

    console.log("✅ faceDescriptor salvo para", funcionarioId);
    return descArray;
  } catch (err) {
    console.error("Erro ao gerar/salvar faceDescriptor:", err);
    return null;
  }
}

export default function FuncionarioPerfil() {
  const { lojaId, funcionarioId } = useParams();
  const navigate = useNavigate();
  const [funcionario, setFuncionario] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [fotoPreview, setFotoPreview] = useState(null);
  const [funcData, setFuncData] = useState(null);
  const [pontos, setPontos] = useState([]);
  const [lojaNome, setLojaNome] = useState("");
  const [mode, setMode] = useState("view"); // view | enroll
  const [isAdmin, setIsAdmin] = useState(false);
  const [isGerente, setIsGerente] = useState(false);
  const [temPermissao, setTemPermissao] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [uploadingAtestado, setUploadingAtestado] = useState(false);
  const [reconhecimentoEmAndamento, setReconhecimentoEmAndamento] = useState(false);
  const [regionalHolidaysText, setRegionalHolidaysText] = useState("");
  const [regionalHolidaysParsed, setRegionalHolidaysParsed] = useState([]);
  const [botaoBloqueado, setBotaoBloqueado] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editDayId, setEditDayId] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [editValues, setEditValues] = useState({
    entrada: "",
    intervaloSaida: "",
    intervaloVolta: "",
    saida: "",
    status: "OK",
  });
  const STATUS_OPTIONS = ["OK", "FOLGA", "ATESTADO", "FALTA", "FÉRIAS", "SUSPENSÃO", "DISPENSA"];
  const cameraStreamRef = useRef(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsAdmin(false);
        setIsGerente(false);
        setTemPermissao(false);
        return;
      }

      const ehAdmin = user.uid === ADMIN_UID;
      setIsAdmin(ehAdmin);

      // 🔍 verifica se é gerente
      try {
        const gerenteRef = doc(db, "gerentes", user.uid);
        const gerenteSnap = await getDoc(gerenteRef);
        const ehGerente = gerenteSnap.exists();
        setIsGerente(ehGerente);
        setTemPermissao(ehAdmin || ehGerente);
      } catch (err) {
        console.error("Erro ao verificar gerente:", err);
        setIsGerente(false);
        setTemPermissao(ehAdmin);
      }
    });

    return () => unsub();
  }, []);

  // ... (mesmos hooks de pré-aquecimento / carregamento que você já tinha)
  useEffect(() => {
    const carregarTudo = async () => {
      try {
        console.log("FUNC-PERF: inicializando modelos...");

        await loadFaceApiModels();
        const MODEL_URL = "/models";

        if (!faceapi.nets.ssdMobilenetv1.params) {
          console.log("FUNC-PERF: faceapi.nets não carregados — carregando via faceapi.loadFromUri...");
          await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          ]);
        }

        console.log("FUNC-PERF: modelos carregados com sucesso.");

        // ✅ Só carrega os dados se lojaId e funcionarioId existirem
        if (lojaId && funcionarioId) {
          console.log("FUNC-PERF: IDs detectados, carregando dados...");
          await carregarLoja();
          await carregarFuncionario();
          await carregarPontos();
          await verificarFolgaAutomatica();
          loadRegionaisFromStorage();
        } else {
          console.warn("FUNC-PERF: lojaId ou funcionarioId indefinidos, pulando carregamento.");
        }
      } catch (err) {
        console.warn("FUNC-PERF: Falha geral no carregamento:", err);
      }
    };

    carregarTudo();
  }, []);

  // Pré-carrega permissão da câmera
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        console.log("📸 Permissão de câmera pré-carregada no perfil!");
      })
      .catch(() => {
        console.warn("⚠️ Usuário negou a permissão de câmera antecipadamente.");
      });
  }, []);

  const loadRegionaisFromStorage = () => {
    try {
      const raw = localStorage.getItem(LS_KEY_REGIONAIS);
      if (raw) {
        setRegionalHolidaysText(raw);
        const parsed = parseRegionalHolidaysText(raw);
        setRegionalHolidaysParsed(parsed);
      } else {
        setRegionalHolidaysText("");
        setRegionalHolidaysParsed([]);
      }
    } catch (err) {
      console.warn("Erro ao carregar feriados regionais do localStorage:", err);
    }
  };

  const saveRegionaisToStorage = (text) => {
    try {
      localStorage.setItem(LS_KEY_REGIONAIS, text || "");
      setRegionalHolidaysText(text || "");
      const parsed = parseRegionalHolidaysText(text || "");
      setRegionalHolidaysParsed(parsed);
      alert("Feriados regionais salvos (localStorage).");
    } catch (err) {
      console.warn("Erro ao salvar feriados regionais:", err);
      alert("Erro ao salvar feriados regionais no navegador.");
    }
  };

  const clearRegionais = () => {
    try {
      localStorage.removeItem(LS_KEY_REGIONAIS);
      setRegionalHolidaysText("");
      setRegionalHolidaysParsed([]);
    } catch (err) {
      console.warn("Erro ao limpar feriados regionais:", err);
    }
  };

  const carregarLoja = async () => {
    try {
      const lojaSnap = await getDoc(doc(db, "lojas", lojaId));
      if (lojaSnap.exists()) setLojaNome(lojaSnap.data().nome);
    } catch (err) {
      console.error("FUNC-PERF: Erro carregarLoja:", err);
    }
  };

  // ✅ Função corrigida de carregarFuncionario
  const carregarFuncionario = async () => {
    try {
      const funcSnap = await getDoc(doc(db, "lojas", lojaId, "funcionarios", funcionarioId));
      if (funcSnap.exists()) {
        const d = funcSnap.data();
        setFuncData(d);
        if (d.fotoReferencia && !d.faceDescriptor) {
          console.log("FUNC-PERF: faceDescriptor ausente — gerando automaticamente...");
          gerarEDepositarFaceDescriptor(lojaId, funcionarioId, d.fotoReferencia).then((novoDesc) => {
            if (novoDesc) {
              setFuncData((prev) => ({ ...prev, faceDescriptor: novoDesc }));
            }
          });
        }

        setFuncionario({ id: funcionarioId, ...d });
        setFotoPreview(d.fotoReferencia || "");
        console.log("FUNC-PERF: Dados do funcionário carregados:", { id: funcionarioId, ...d });
      } else {
        console.warn("FUNC-PERF: Funcionário não encontrado no Firestore.");
        setFuncData(null);
        setFuncionario(null);
        setFotoPreview("");
      }
    } catch (err) {
      console.error("FUNC-PERF: Erro carregarFuncionario:", err);
    }
  };

  const carregarPontos = async () => {
    try {
      setCarregando(true);
      const snap = await getDocs(
        collection(db, "lojas", lojaId, "funcionarios", funcionarioId, "pontos")
      );
      const lista = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => b.id.localeCompare(a.id));
      setPontos(lista);
      console.log("FUNC-PERF: pontos carregados:", lista.length);
    } catch (err) {
      console.error("FUNC-PERF: Erro carregarPontos:", err);
    } finally {
      setCarregando(false);
    }
  };

  const getHojeId = () => {
    try {
      const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: BRAZIL_TZ }).format(new Date());
      if (/^\d{4}-\d{2}-\d{2}$/.test(hoje)) return hoje;
    } catch (err) {}
    const agora = new Date();
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(
      agora.getDate()
    ).padStart(2, "0")}`;
  };

  const getHoraAtualLocal = () => {
    try {
      const hora = new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: BRAZIL_TZ,
      }).format(new Date());
      const parts = hora.split(":").map((s) => s.padStart(2, "0"));
      return `${parts[0]}:${parts[1]}`;
    } catch {
      const agora = new Date();
      return agora.toTimeString().split(":").slice(0, 2).join(":");
    }
  };

  const verificarFolgaAutomatica = async () => {
    try {
      const agoraSP = new Date(new Date().toLocaleString("en-US", { timeZone: BRAZIL_TZ }));
      if (agoraSP.getHours() < 16) return;
      const hoje = getHojeId();
      const docRef = doc(db, "lojas", lojaId, "funcionarios", funcionarioId, "pontos", hoje);
      let snap;
      try {
        snap = await getDoc(docRef, { source: "server" });
      } catch {
        snap = await getDoc(docRef);
      }
      if (!snap.exists()) {
        await setDoc(docRef, { data: hoje, status: "FOLGA", criadoEm: serverTimestamp() });
        await carregarPontos();
      }
    } catch (err) {
      console.error("FUNC-PERF: Erro verificarFolgaAutomatica:", err);
    }
  };

  const onVerifyPunchSuccess = async () => {
    try {
      const agoraSP = new Date(new Date().toLocaleString("en-US", { timeZone: BRAZIL_TZ }));
      const horaAtual = getHoraAtualLocal();

      // ID do dia atual
      const hojeId = getHojeId();

      // ID do dia anterior
      const ontemDate = new Date(agoraSP);
      ontemDate.setDate(ontemDate.getDate() - 1);
      const ontemId = new Intl.DateTimeFormat("en-CA", {
        timeZone: BRAZIL_TZ,
      }).format(ontemDate);

      // -------------- REGRA NOVA AQUI ---------------
      // Se a hora é entre 00:00 e 04:59, consideramos como SAÍDA do dia anterior
      const horaNum = parseInt(horaAtual.split(":")[0]);

      let targetDayId = hojeId;
      let isNightExit = false;

      if (horaNum >= 0 && horaNum < 5) {
        // madrugada → deve bater a saída no dia anterior
        targetDayId = ontemId;
        isNightExit = true;
      }

      // -----------------------------------------------

      const docRef = doc(db, "lojas", lojaId, "funcionarios", funcionarioId, "pontos", targetDayId);

      let snap;
      try {
        snap = await getDoc(docRef, { source: "server" });
      } catch {
        snap = await getDoc(docRef);
      }

      // Carrega ou cria dados
      let dados = snap.exists()
        ? { ...snap.data() }
        : { data: targetDayId, status: "OK" };

      // Conta quantos pontos já existem
      const pontosHoje = [dados.entrada, dados.intervaloSaida, dados.intervaloVolta, dados.saida].filter(Boolean)
        .length;

      // ------- Lógica padrão de preenchimento -------
      if (!dados.entrada) {
        dados.entrada = horaAtual;
      } else if (!dados.intervaloSaida) {
        dados.intervaloSaida = horaAtual;
      } else if (!dados.intervaloVolta) {
        dados.intervaloVolta = horaAtual;
      } else if (!dados.saida) {
        dados.saida = horaAtual;
      } else {
        alert("⚠️ Todos os pontos deste dia já foram marcados.");
        return;
      }

      // Se for ponto da madrugada aplicado retroativamente, garante que é SAÍDA
      if (isNightExit) {
        dados.saida = horaAtual;
      }

      await setDoc(docRef, dados, { merge: true });

      await carregarPontos();

      alert(isNightExit ? "✅ Saída registrada no dia anterior!" : "✅ Ponto registrado com sucesso!");

      setMode("view");
    } catch (err) {
      console.error("FUNC-PERF: ❌ Erro onVerifyPunchSuccess:", err);
      alert("Erro ao registrar ponto.");
    }
  };

  // Descriptor salvo do funcionário (se houver)
  const storedDesc = funcData?.faceDescriptor ? arrayToDescriptor(funcData.faceDescriptor) : null;
  // === performLiveRecognitionAndPunch (cole no lugar da função antiga) ===
  const performLiveRecognitionAndPunch = async ({ attemptsTimeout = 9000, intervalMs = 800 } = {}) => {
    if (reconhecimentoEmAndamento) {
      console.warn("⏳ Reconhecimento já em andamento — clique ignorado.");
      return;
    }

    if (!storedDesc) {
      alert("⚠️ Nenhuma foto cadastrada para reconhecimento facial.");
      return;
    }

    setReconhecimentoEmAndamento(true);

    let stream = null;
    let video = null;

    try {
      // 🔥 Pré-aquecimento
      try {
        const warm = await navigator.mediaDevices.getUserMedia({ video: true });
        warm.getTracks().forEach((t) => t.stop());
      } catch {}

      console.log("📸 Abrindo camera...");
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });

      // 🔥 Elemento de vídeo REAL
      video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;

      Object.assign(video.style, {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "350px",
        height: "300px",
        background: "#000",
        zIndex: 99999,
        border: "2px solid white",
        borderRadius: "10px",
      });

      video.srcObject = stream;
      document.body.appendChild(video);

      // 🔥 ESPERA REAL da câmera abrir
      const cameraReady = await new Promise((res) => {
        let timeout = setTimeout(() => res(false), 3000);
        video.onloadeddata = () => {
          clearTimeout(timeout);
          res(true);
        };
      });

      if (!cameraReady) {
        alert("❌ A câmera não conseguiu iniciar. Tente novamente.");
        throw new Error("camera-failed");
      }

      console.log("📸 Camera pronta.");

      // 🔥 Loop de reconhecimento
      const start = Date.now();
      let matched = false;

      while (Date.now() - start < attemptsTimeout && !matched) {
        const det = await faceapi
          .detectSingleFace(video, new faceapi.SsdMobilenetv1Options())
          .withFaceLandmarks()
          .withFaceDescriptor();

        if (det?.descriptor) {
          const distance = faceapi.euclideanDistance(storedDesc, det.descriptor);
          console.log("DIST:", distance);

          if (distance < 0.45) {
            matched = true;
            console.log("🎉 Rosto reconhecido! Marcando ponto...");
            await onVerifyPunchSuccess();
            break;
          }
        }
        await new Promise((r) => setTimeout(r, intervalMs));
      }

      if (!matched) {
        alert("😕 Não foi possível reconhecer seu rosto. Tente procurar um ângulo melhor.");
      }
    } catch (err) {
      console.error("❌ ERRO NO RECONHECIMENTO:", err);
      alert("Erro durante o reconhecimento facial.");
    } finally {
      // Cleanup REAL
      try {
        if (stream) stream.getTracks().forEach((t) => t.stop());
        if (video && video.parentNode) video.remove();
      } catch {}

      setReconhecimentoEmAndamento(false);
      console.log("🔚 Camera fechada.");
    }
  };
  // botão chama esta função
  const requestPunchWithFace = async () => {
    if (!funcData) {
      alert("Dados do funcionário ainda não carregados. Aguarde um pouco.");
      return;
    }
    await performLiveRecognitionAndPunch({ attemptsTimeout: 9000, intervalMs: 900 });
  };

  const handleUploadAtestado = async (dayId, file) => {
  if (!file) return;
  try {
    setUploadingAtestado(true);

    // 1) Faz upload da imagem
    const url = await uploadImage(file);

    // 2) Atualiza o documento do ponto
    await updateDoc(
      doc(db, "lojas", lojaId, "funcionarios", funcionarioId, "pontos", dayId),
      {
        atestadoUrl: url,
        atestadoUploadedAt: serverTimestamp(),
        status: "ATESTADO",  // <<< AQUI A MÁGICA ACONTECE
      }
    );

    // 3) Recarrega os pontos
    await carregarPontos();

    alert("📄 Atestado enviado com sucesso! Status atualizado para ATESTADO.");
  } catch (err) {
    console.error(err);
    alert("Erro ao enviar atestado.");
  } finally {
    setUploadingAtestado(false);
  }
};


  const handleExcluirPonto = async (dayId) => {
    if (!temPermissao) return alert("Somente gerente ou admin pode ...");
    if (!window.confirm("Excluir este dia e todos os dados associados?")) return;
    try {
      await deleteDoc(doc(db, "lojas", lojaId, "funcionarios", funcionarioId, "pontos", dayId));
      await carregarPontos();
      alert("🗑️ Ponto excluído com sucesso!");
    } catch {
      alert("Erro ao excluir ponto.");
    }
  };
  // === EDIT MODAL HELPERS ===
  const openEditModal = (day) => {
    if (!temPermissao) return alert("Somente gerente ou admin pode ...");
    setEditDayId(day.id);
    setEditValues({
      entrada: day.entrada || "",
      intervaloSaida: day.intervaloSaida || "",
      intervaloVolta: day.intervaloVolta || "",
      saida: day.saida || "",
      status: day.status || "OK",
    });
    setEditOpen(true);
  };

  const closeEditModal = () => {
    setEditOpen(false);
    setEditDayId(null);
    setEditValues({ entrada: "", intervaloSaida: "", intervaloVolta: "", saida: "", status: "OK" });
  };

  const handleEditChange = (field, value) => {
    setEditValues((s) => ({ ...s, [field]: value }));
  };

  const saveEdit = async () => {
    if (!editDayId) return;
    try {
      const docRef = doc(db, "lojas", lojaId, "funcionarios", funcionarioId, "pontos", editDayId);
      // build payload: keep empty strings as removals
      const payload = {
        entrada: editValues.entrada || null,
        intervaloSaida: editValues.intervaloSaida || null,
        intervaloVolta: editValues.intervaloVolta || null,
        saida: editValues.saida || null,
        status: editValues.status || "OK",
        atualizadoEm: serverTimestamp(),
      };
      // We'll use setDoc with merge true and post-process by removing keys if null (simple approach: fetch existing and set)
      const snap = await getDoc(docRef);
      const existing = snap.exists() ? snap.data() : {};
      const next = { ...existing, ...payload };
      // remove null fields
      ["entrada", "intervaloSaida", "intervaloVolta", "saida"].forEach((k) => {
        if (next[k] === null) delete next[k];
      });
      await setDoc(docRef, next, { merge: true });
      await carregarPontos();
      alert("Alterações salvas com sucesso!");
      closeEditModal();
    } catch (err) {
      console.error("Erro ao salvar edição:", err);
      alert("Erro ao salvar alterações. Veja console.");
    }
  };
  // Admin helper: allow clearing a single timestamp
  const clearTimestamp = async (dayId, field) => {
    if (!temPermissao) return alert("Somente gerente ou admin pode ...");
    if (!window.confirm("Remover este horário?")) return;
    try {
      const docRef = doc(db, "lojas", lojaId, "funcionarios", funcionarioId, "pontos", dayId);
      const snap = await getDoc(docRef);
      if (!snap.exists()) return alert("Documento não encontrado.");
      const data = snap.data() || {};
      delete data[field];
      data.atualizadoEm = serverTimestamp();
      await setDoc(docRef, data, { merge: true });
      await carregarPontos();
      alert("Horário removido.");
    } catch (err) {
      console.error("Erro ao remover horário:", err);
      alert("Erro ao remover horário.");
    }
  };

  const toMinutes = (t) => {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const minutesToHHMM = (mins) => {
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return `${h}h ${m}m`;
  };

  // groupByMonth (mantive tua lógica original e adapta para usar calcMinutes)
  const groupByMonth = (pontosList) => {
    const map = new Map();
    pontosList.forEach((p) => {
      const date = new Date(p.id + "T00:00:00");
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
      if (!map.has(key)) map.set(key, { label, days: [], totalMinutes: 0 });
      const entry = map.get(key);
      entry.days.push(p);
      entry.totalMinutes += calcMinutesWorkedForDay(p);
    });
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([monthKey, v]) => ({ monthKey, ...v }));
  };

  // Helpers: parse regional holidays text
  const parseRegionalHolidaysText = (text) => {
    if (!text) return [];
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      const parts = line.split("-");
      const datePart = parts[0].trim();
      const namePart = parts.slice(1).join("-").trim() || "Feriado Local";
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        out.push({ dateIso: datePart, date: formatDateToDDMM(datePart), name: namePart });
        continue;
      }
      if (/^\d{2}\/\d{2}(\/\d{4})?$/.test(datePart)) {
        if (/^\d{2}\/\d{2}$/.test(datePart)) {
          out.push({ dateIso: null, date: datePart, name: namePart });
        } else {
          const [dd, mm, yyyy] = datePart.split("/");
          const iso = `${yyyy}-${mm}-${dd}`;
          out.push({ dateIso: iso, date: formatDateToDDMM(iso), name: namePart });
        }
        continue;
      }
      try {
        const d = new Date(datePart);
        if (!isNaN(d.getTime())) {
          const iso = d.toISOString().slice(0, 10);
          out.push({ dateIso: iso, date: formatDateToDDMM(iso), name: namePart });
        }
      } catch {}
    }
    return out;
  };

  const formatDateToDDMM_local = (isoDate) => {
    try {
      const d = new Date(isoDate + "T00:00:00");
      const dd = String(d.getDate()).padStart(2, "0");
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      return `${dd}/${mm}`;
    } catch {
      return isoDate;
    }
  };

 const gerarRelatorio = async (monthObj) => {
  try {
    const [yearStr, monthStr] = monthObj.monthKey.split("-");
    const ano = Number(yearStr);
    const mesIndex = Number(monthStr) - 1;
    const nomeMes = new Date(ano, mesIndex, 1).toLocaleString("pt-BR", {
      month: "long",
      year: "numeric",
    });

    const funcionarioLocal = funcData || {};
    const loja = lojaNome || lojaId;

    /* ==============================
         FERIADOS NACIONAIS
    ============================== */
    let feriadosNacionais = [];
    try {
      const resp = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
      if (resp.ok) {
        const json = await resp.json();
        feriadosNacionais = json.map((f) => ({
          dateIso: f.date,
          date: formatDateToDDMM(f.date),
          name: f.name,
          type: "Nacional",
        }));
      }
    } catch (err) {
      console.warn("Falha ao buscar feriados nacionais:", err);
    }

    /* ==============================
         FERIADOS REGIONAIS
    ============================== */
    const feriadosRegionaisFromText = parseRegionalHolidaysText(regionalHolidaysText || "");
    const todosFeriados = [...feriadosNacionais, ...feriadosRegionaisFromText];

    const feriadosMap = new Map();
    todosFeriados.forEach((f) => {
      const key = f.dateIso || f.date;
      if (key) {
        if (!feriadosMap.has(key) || (f.type === "Nacional" && feriadosMap.get(key).type !== "Nacional")) {
          feriadosMap.set(key, f);
        }
      }
    });

    /* ==============================
         MONTAGEM DOS DIAS
    =============================== */
    const rows = [];
    let totalMinutesMonth = 0;
    const diasNoMes = new Date(ano, mesIndex + 1, 0).getDate();

    // helper para detectar URL de atestado em p
    const getAtestadoUrl = (p) => {
      if (!p) return null;
      const candidates = [
        "atestadoUrl",
        "atestado_url",
        "atestadoLink",
        "atestado_link",
        "atestado",
        "file",
        "image",
        "mediaUrl",
        "arquivo"
      ];
      for (const k of candidates) {
        if (p[k]) {
          // se for objeto com url
          if (typeof p[k] === "object" && p[k].url) return String(p[k].url);
          return String(p[k]);
        }
      }
      return null;
    };

    for (let dia = 1; dia <= diasNoMes; dia++) {
      const iso = `${ano}-${String(mesIndex + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      const p = (monthObj.days || []).find((d) => d.id === iso) || {};

      const weekday = new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", {
        weekday: "long",
      });

      const ddmm = formatDateToDDMM(iso);
      const feriadoMatch = feriadosMap.get(iso) || feriadosMap.get(ddmm);

      const diaLabel = feriadoMatch
        ? `${capitalize(weekday)} (Feriado)`
        : capitalize(weekday);

      let entradaCell = p.entrada || "-";
      let saidaIntCell = p.intervaloSaida || "-";
      let voltaIntCell = p.intervaloVolta || "-";
      let saidaCell = p.saida || "-";

      // status: se existir p.status (OK, Atestado, Folga, Falta, etc.)
      const statusCell = (p.status && String(p.status).trim() !== "") ? String(p.status) : "-";

      if (p.status && p.status !== "OK") {
        // A sua lógica atual sobrescreve as células com o status em casos especiais.
        // Mantive essa mesma ideia (como você já tinha).
        entradaCell = saidaIntCell = voltaIntCell = saidaCell = p.status;
      }

      let minutosDia = 0;
      try {
        minutosDia = calcMinutesWorkedForDay(p) || 0;
      } catch {}

      totalMinutesMonth += minutosDia;

      rows.push([
        iso.split("-").reverse().join("/"),
        diaLabel,
        entradaCell,
        saidaIntCell,
        voltaIntCell,
        saidaCell,
        statusCell, // nova coluna
        // guardamos também o objeto p para referência (usar índice mais adiante)
      ]);
    }

    /* ==============================
                PDF
    =============================== */
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const left = 30;
    const usableWidth = pageWidth - left * 2;

    /* ==============================
              CABEÇALHO
    =============================== */
    const topStart = 40;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(15);
    doc.setTextColor(0);
    doc.text(`Relatório de Ponto - ${capitalize(nomeMes)}`, left, topStart);

    doc.setFontSize(10);
    doc.text(`Funcionário: ${funcionarioLocal.nome || funcionarioId}`, left, topStart + 20);
    doc.text(`Loja: ${loja}`, left, topStart + 34);
    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, left, topStart + 48);

    /* ==============================
           TABELA - MANUAL
           (COM ZEBRA E TEXTO PRETO)
    =============================== */
    // agora com coluna Status
    const header = ["Data", "Dia", "Entrada", "Saída I.", "Volta I.", "Saída", "Status"];
    // largura das colunas — soma pode ser menor que usableWidth, é ok
    const colW = [70, 170, 60, 60, 60, 60, 65];

    let y = topStart + 70;

    // Cabeçalho azul
    doc.setFillColor(41, 128, 185);
    doc.setTextColor(255);
    doc.rect(left, y, usableWidth, 18, "F");

    doc.setFontSize(9);
    let xx = left;
    for (let i = 0; i < header.length; i++) {
      doc.text(header[i], xx + 3, y + 12);
      xx += colW[i];
    }

    y += 18;

    // RESET FULL
    doc.setFontSize(8);

    // desenhar linhas da tabela com zebra (usar cinza visível)
    for (let idx = 0; idx < rows.length; idx++) {
      const r = rows[idx];
      const isEven = idx % 2 === 0;

      // fundo
      if (isEven) doc.setFillColor(200, 200, 200); // cinza forte visível
      else doc.setFillColor(255, 255, 255);

      doc.rect(left, y, usableWidth, 16, "F");

      // borda da linha
      doc.setDrawColor(180);
      doc.rect(left, y, usableWidth, 16, "S");

      // texto (redundante preto)
      doc.setTextColor(0);
      doc.setTextColor(0, 0, 0);
      doc.setTextColor(1, 1, 1);

      let xCell = left;
      for (let c = 0; c < r.length; c++) {
        // alinhar a coluna STATUS ao centro
        if (c === header.length - 1) {
          // center status
          const txt = String(r[c] || "-");
          const txtW = doc.getTextWidth(txt);
          const cellW = colW[c];
          const cx = xCell + (cellW / 2);
          doc.text(txt, cx, y + 11, { align: "center" });
        } else if (c === 1) {
          // coluna "Dia" pode ter texto maior, deixar left com padding
          doc.text(String(r[c] || "-"), xCell + 3, y + 11);
        } else {
          // centralizar horários (col 2..5)
          const txt = String(r[c] || "-");
          if (c >= 2 && c <= 5) {
            const cellW = colW[c];
            const cx = xCell + cellW / 2;
            doc.text(txt, cx, y + 11, { align: "center" });
          } else {
            doc.text(txt, xCell + 3, y + 11);
          }
        }
        xCell += colW[c];
        doc.setTextColor(0); // redundância
      }

      y += 16;
      doc.setDrawColor(0); // redundância
    }

    /* ==============================
            FERIADOS
    =============================== */
    y += 20;
    const feriadosStartY = y;   // <<< salve a altura inicial dos feriados
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text("Feriados no mês:", left, y);

    y += 14;

    const feriadosNoMes = Array.from(feriadosMap.values()).filter((f) => {
      if (f.dateIso)
        return f.dateIso.startsWith(`${ano}-${String(mesIndex + 1).padStart(2, "0")}`);
      if (f.date) {
        const [d, m] = f.date.split("/");
        return m === String(mesIndex + 1).padStart(2, "0");
      }
      return false;
    });

    doc.setFontSize(9);

    if (feriadosNoMes.length === 0) {
      doc.text("Nenhum feriado registrado no mês.", left + 6, y);
      y += 12;
    } else {
      for (const f of feriadosNoMes) {
        if (y > pageHeight - 120) {
          doc.addPage();
          y = 40;
        }
        const dataFmt = f.dateIso
          ? f.dateIso.split("-").reverse().join("/")
          : f.date;
        const tipo = f.type || "Regional";
        const nomeF = f.name || "(sem nome)";
        doc.text(`- ${dataFmt} — ${nomeF} (${tipo})`, left + 6, y);
        y += 12;
      }
    }

    /* ==============================
            TOTAL
    =============================== */
    y += 14;
    const totalFmt = minutesToHHMM(totalMinutesMonth);
    doc.setFontSize(10);
    doc.text(`Total de horas trabalhadas no mês: ${totalFmt}`, left, y);
    y += 20;

    /* ==============================
        LISTA DE ATESTADOS (links)
        — alinhados com a altura dos feriados
============================== */

// altura exata onde os feriados começam
const atestadosStartY = feriadosStartY;  // <<< usaremos essa variável

const atestados = (monthObj.days || [])
  .map((d) => {
    const url = getAtestadoUrl(d);
    return url ? { dateIso: d.id, url } : null;
  })
  .filter(Boolean);

if (atestados.length > 0) {
  let attestX = left + usableWidth - 200;
  let attestY = atestadosStartY + 2;

  doc.setFontSize(10);
  doc.setTextColor(0, 0, 255);

  for (const a of atestados) {
    const dateText = a.dateIso.split("-").reverse().join("/");
    const label = `Atestado ${dateText}`;

    doc.text(label, attestX, attestY);

    const textW = doc.getTextWidth(label);
    doc.setDrawColor(30, 60, 160);
    doc.setLineWidth(0.8);
    doc.line(attestX, attestY + 2, attestX + textW, attestY + 2);

    doc.link(attestX, attestY - 8, textW, 12, { url: a.url });

    attestY += 14;
  }

  doc.setTextColor(0);
}


    y = Math.max(y + 60, pageHeight - 140);

    /* ==============================
            ASSINATURAS
    =============================== */
    const sigWidth = 150;

    // Gerente (esquerda)
    doc.line(left, y, left + sigWidth, y);
    doc.text("Assinatura do Gerente", left, y + 14);

    // Funcionário (direita)
    const xRight = pageWidth - left - sigWidth;
    doc.line(xRight, y, xRight + sigWidth, y);
    doc.text("Assinatura do Funcionário", xRight, y + 14);

    /* ==============================
               SALVAR
    =============================== */
    const safeNomeMes = capitalize(nomeMes).replace(/\s+/g, "");
    const nomeArquivo = `Relatorio_${safeNomeMes}_${funcionarioLocal.nome ? slugify(funcionarioLocal.nome) : funcionarioId}.pdf`;

    doc.save(nomeArquivo);

  } catch (err) {
    console.error("gerarRelatorio erro:", err);
    alert("Erro ao gerar relatório. Veja o console.");
  }
};


  /* -------------------------- gerarContraChequePdf ------------------------- */
  const gerarContraChequePdf = async (monthObj, salaryBase = 1660.63) => {
    try {
      // Build feriadosMap similar to gerarRelatorio
      let feriadosNacionais = [];
      try {
        const ano = Number(monthObj.monthKey.split("-")[0]);
        const resp = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
        if (resp.ok) {
          const json = await resp.json();
          feriadosNacionais = json.map((f) => ({
            dateIso: f.date,
            date: formatDateToDDMM(f.date),
            name: f.name,
            type: "Nacional",
          }));
        }
      } catch (err) {
        console.warn("Falha ao buscar feriados nacionais:", err);
      }

      const feriadosRegionaisFromText = parseRegionalHolidaysText(regionalHolidaysText || "");
      const todosFeriados = [...feriadosNacionais, ...feriadosRegionaisFromText];
      const feriadosMap = new Map();
      todosFeriados.forEach((f) => {
        const key = f.dateIso || f.date;
        if (key) {
          if (!feriadosMap.has(key) || (f.type === "Nacional" && feriadosMap.get(key).type !== "Nacional")) {
            feriadosMap.set(key, f);
          }
        }
      });

      // Use imported computeMonthlyPayroll
      const payroll = computeMonthlyPayroll(monthObj, salaryBase, {
        diarioMinutos: 440,
        feriadosMap,
      });

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 40;
      let y = 40;

      doc.setFontSize(16);
      doc.text(`Contra-Cheque - ${monthObj.label || monthObj.monthKey}`, margin, y);
      y += 18;
      doc.setFontSize(11);
      doc.text(`Funcionário: ${funcData?.nome || funcionarioId}`, margin, y);
      y += 14;
      doc.text(`Salário Base: R$ ${salaryBase.toFixed(2)}`, margin, y);
      y += 18;

      const pays = payroll.pays;
      const formatMoney = (v) => `R$ ${Number(v || 0).toFixed(2)}`;

      doc.setFontSize(12);
      doc.text("Resumo de Proventos:", margin, y);
      y += 14;
      doc.setFontSize(10);

      const lines = [
        ["Horas normais (min):", payroll.totals.totalMinNormal],
        ["Horas extras 50% (min):", payroll.totals.totalMinExtra50],
        ["Horas extras 100% (min):", payroll.totals.totalMinExtra100],
        ["Horas noturnas totais (min):", payroll.totals.totalMinNight],
        ["", ""],
        ["Normal (não noturno):", formatMoney(pays.normalNonNightPay)],
        ["Normal (noturno):", formatMoney(pays.normalNightPay)],
        ["Extra 50% (não noturno):", formatMoney(pays.extra50NonNightPay)],
        ["Extra 50% (noturno):", formatMoney(pays.extra50NightEffectivePay)],
        ["Extra 100% (não noturno):", formatMoney(pays.extra100NonNightPay)],
        ["Extra 100% (noturno):", formatMoney(pays.extra100NightEffectivePay)],
        ["", ""],
        ["TOTAL BRUTO:", formatMoney(pays.totalGross)],
      ];

      for (const [label, val] of lines) {
        if (y > pageH - 80) {
          doc.addPage();
          y = 40;
        }
        doc.text(label, margin, y);
        doc.text(String(val), pageW - margin - 120, y);
        y += 12;
      }

      // Página 2 - Detalhamento por dia
      doc.addPage();
      y = 40;
      doc.setFontSize(12);
      doc.text("Detalhamento Dia-a-Dia", margin, y);
      y += 16;
      doc.setFontSize(9);
      const headers = ["Data", "Trab.", "Normal", "E50", "E100", "Not.", "Feriado"];
      const colW = (pageW - margin * 2) / headers.length;
      headers.forEach((h, i) => doc.text(h, margin + i * colW, y));
      y += 12;

      for (const d of payroll.perDayDetails) {
        if (y > pageH - 40) {
          doc.addPage();
          y = 40;
        }
        const dt = d.date.split("-").reverse().join("/");
        const w = `${Math.floor(d.workedMin / 60)}:${String(d.workedMin % 60).padStart(2, "0")}`;
        const n = `${Math.floor(d.normalMin / 60)}:${String(d.normalMin % 60).padStart(2, "0")}`;
        const e50 = `${Math.floor(d.extra50Min / 60)}:${String(d.extra50Min % 60).padStart(2, "0")}`;
        const e100 = `${Math.floor(d.extra100Min / 60)}:${String(d.extra100Min % 60).padStart(2, "0")}`;
        const nt = `${Math.floor(d.nightMin / 60)}:${String(d.nightMin % 60).padStart(2, "0")}`;
        const fer = d.isFeriado ? "SIM" : "NÃO";
        const cols = [dt, w, n, e50, e100, nt, fer];
        cols.forEach((c, i) => doc.text(String(c), margin + i * colW, y));
        y += 10;
      }

      // Página final - declaração
      doc.addPage();
      let yy = 40;
      const nomeFunc = funcData?.nome || funcionarioId;
      doc.setFontSize(11);
      const concordText = `Eu, ${nomeFunc}, declaro que estou ciente e concordo com os dados apresentados neste contra-cheque.`;
      doc.text(concordText, margin, yy, { maxWidth: pageW - margin * 2 });
      yy += 40;
      doc.text("Assinatura: ________________________________", margin, yy);

      const safeNome = (nomeFunc || funcionarioId).replace(/\s+/g, "_");
      doc.save(`ContraCheque_${monthObj.monthKey || "mes"}_${safeNome}.pdf`);
    } catch (err) {
      console.error("Erro gerarContraChequePdf:", err);
      alert("Erro ao gerar contra-cheque. Veja console.");
    }
  };

  // ☁️ Faz upload da imagem para o Cloudinary e salva no Firestore
  const uploadPhotoToFirebase = async (file) => {
    try {
      if (!file) throw new Error("Arquivo inválido.");

      // 1️⃣ Faz upload no Cloudinary
      const imageUrl = await uploadImage(file);
      console.log("✅ Upload no Cloudinary concluído:", imageUrl);

      // 2️⃣ Gera descriptor com face-api
      const img = await faceapi.fetchImage(imageUrl);
      const detection = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();

      if (!detection) {
        alert("Nenhum rosto detectado na imagem! Tente outra foto.");
        return;
      }

      // 3️⃣ Converte descriptor para array simples
      const descriptorArray = Array.from(detection.descriptor);

      // 4️⃣ Referência ao funcionário
      const funcionarioRef = doc(db, "lojas", lojaId, "funcionarios", funcionarioId);

      // 5️⃣ Atualiza Firestore com foto + descriptor
      await updateDoc(funcionarioRef, {
        fotoReferencia: imageUrl,
        faceDescriptor: descriptorArray,
        updatedAt: new Date().toISOString(),
      });

      // 6️⃣ Atualiza estado local para refletir a nova foto
      setFotoPreview(imageUrl);
      setFuncData((prev) => ({ ...(prev || {}), fotoReferencia: imageUrl, faceDescriptor: descriptorArray }));
      setFuncionario((prev) => ({ ...(prev || {}), fotoReferencia: imageUrl }));

      alert("✅ Foto e reconhecimento facial atualizados com sucesso!");
      console.log("📸 Face descriptor salvo com sucesso.");
      return imageUrl;
    } catch (error) {
      console.error("❌ Erro ao enviar foto:", error);
      alert("Erro ao enviar a foto. Tente novamente.");
      throw error;
    }
  };

  const handleFileUpload = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file) return;

    try {
      setUploading(true);

      // 1) Envia para o Cloudinary
      const imageUrl = await uploadImage(file); // sua função services/cloudinary.js

      // 2) Atualiza o documento NO MESMO PATH que você usa para ler
      const funcionarioRef = doc(db, "lojas", lojaId, "funcionarios", funcionarioId);
      // Use setDoc merge/update para não sobrescrever campos importantes
      await updateDoc(funcionarioRef, { fotoReferencia: imageUrl, updatedAt: new Date().toISOString() });

      // 3) Atualiza estados locais para refletir mudança imediatamente
      setFotoPreview(imageUrl);
      setFuncData((prev) => ({ ...(prev || {}), fotoReferencia: imageUrl }));
      setFuncionario((prev) => ({ ...(prev || {}), fotoReferencia: imageUrl }));

      console.log("✅ Foto atualizada com sucesso:", imageUrl);
      alert("✅ Foto atualizada com sucesso!");
    } catch (error) {
      console.error("Erro ao enviar foto:", error);
      alert("Erro ao enviar a foto. Veja console.");
    } finally {
      setUploading(false);
    }
  };

  // helpers
  function capitalize(s) {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function slugify(s) {
    return s ? s.toLowerCase().replace(/\s+/g, "_").replace(/[^\w_-]/g, "") : "funcionario";
  }

  if (carregando)
    return (
      <Container
        sx={{
          bgcolor: "#121212",
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <CircularProgress color="inherit" />
      </Container>
    );

  const months = groupByMonth(pontos);
  const nowSP = new Date(new Date().toLocaleString("en-US", { timeZone: BRAZIL_TZ }));
  const currentMonthKey = `${nowSP.getFullYear()}-${String(nowSP.getMonth() + 1).padStart(2, "0")}`;

  return (
    <Container sx={{ bgcolor: "#121212", minHeight: "100vh", py: 4, color: "white" }}>
      <Box sx={{ position: "fixed", top: 8, right: 16, color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
        Versão 1.0 - Criado por Zambiazi
      </Box>
      <Stack direction="row" alignItems="center" spacing={2} mb={3} justifyContent="center">
        <Button
          variant="outlined"
          color="secondary"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(isAdmin ? `/admin/loja/${lojaId}` : `/loja/${lojaId}/painel`)}
        >
          Voltar
        </Button>
        <Box display="flex" alignItems="center" gap={2}>
          <img src="/logo.jpg" alt="Logo" style={{ width: 52, height: 52, borderRadius: "50%" }} />
          <Typography variant="h5" sx={{ color: "#fff", fontWeight: "bold" }}>
            {lojaNome || "Loja"}
          </Typography>
        </Box>
      </Stack>
      <Paper sx={{ p: 3, bgcolor: "#1e1e1e", borderRadius: 3 }}>
        <Box textAlign="center" mb={3}>
          {funcData?.fotoReferencia ? (
            <>
              {funcionario ? (
                <Avatar
                  key={(fotoPreview || funcData?.fotoReferencia || "") + "_" + (funcionarioId || "")}
                  src={(fotoPreview || funcData?.fotoReferencia || "") + (fotoPreview ? `?t=${Date.now()}` : "")}
                  alt={funcData?.nome || "Foto do funcionário"}
                  sx={{
                    width: 120,
                    height: 120,
                    mx: "auto",
                    display: "block",
                  }}
                />
              ) : (
                <CircularProgress size={40} />
              )}
              <Typography color="green">✅ Foto cadastrada!</Typography>
            </>
          ) : Array.isArray(funcData?.faceDescriptor) && funcData.faceDescriptor.length > 0 ? (
            <Typography color="green">✅ Foto cadastrada (sem imagem)</Typography>
          ) : (
            <Typography color="red">⚠️ Nenhuma foto cadastrada.</Typography>
          )}

          <Typography variant="h6" sx={{ color: "#fff" }}>
            {funcData?.nome}
          </Typography>
          {temPermissao && (
            <Button
              variant="contained"
              color="warning"
              component="label"
              startIcon={<AddAPhotoIcon />}
              sx={{ mt: 2 }}
            >
              Enviar Nova Foto
              <input hidden accept="image/*" type="file" onChange={handleFileUpload} />
            </Button>
          )}
        </Box>

        <Box textAlign="center" mt={2}>
          <Button
            variant="contained"
            color="success"
            startIcon={<CameraAltIcon />}
            onClick={requestPunchWithFace}
            fullWidth
            disabled={reconhecimentoEmAndamento}
          >
            {reconhecimentoEmAndamento ? "Reconhecendo..." : "Bater Ponto"}
          </Button>
        </Box>

        <Divider sx={{ my: 3, bgcolor: "#333" }} />

        {temPermissao && (
          <Paper sx={{ p: 2, mb: 2, bgcolor: "#222", borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ color: "#fff", mb: 1 }}>
              Feriados Regionais (configuração)
            </Typography>
            <Typography variant="caption" color="#bbb" sx={{ display: "block", mb: 1 }}>
              Formatos por linha: <code>YYYY-MM-DD - Nome</code> ou <code>DD/MM - Nome</code> ou <code>DD/MM/YYYY - Nome</code>.
            </Typography>
            <TextField
              multiline
              minRows={3}
              maxRows={8}
              value={regionalHolidaysText}
              onChange={(e) => setRegionalHolidaysText(e.target.value)}
              placeholder={"Ex:\n2025-10-31 - Feriado de Lajeado\n25/12 - Natal"}
              fullWidth
              sx={{ mb: 1 }}
              InputProps={{ style: { backgroundColor: "#1a1a1a", color: "white" } }}
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" size="small" onClick={() => saveRegionaisToStorage(regionalHolidaysText)}>
                Salvar
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  loadRegionaisFromStorage();
                  alert("Restaurado das configurações salvas.");
                }}
              >
                Restaurar Salvo
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => {
                  clearRegionais();
                  alert("Feriados regionais limpos.");
                }}
              >
                Limpar
              </Button>
            </Stack>
          </Paper>
        )}

        <Typography
          variant="h6"
          mb={2}
          sx={{ color: "#fff", display: "flex", alignItems: "center", gap: 1 }}
        >
          📝 Histórico de Ponto
        </Typography>

        {months.map((month) => (
          <Accordion key={month.monthKey} defaultExpanded={month.monthKey === currentMonthKey} sx={{ bgcolor: "#1a1a1a", color: "white", mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: "#fff" }} />}>
              <Box sx={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                <Typography sx={{ textTransform: "capitalize" }}>{month.label} — ⏱️ {minutesToHHMM(month.totalMinutes)}</Typography>
                {(isAdmin || isGerente) ? (
                  <Stack direction="row" spacing={1}>
                    <Button variant="outlined" size="small" onClick={() => gerarRelatorio(month)}>
                      Gerar Relatório
                    </Button>
                    <Button variant="contained" color="success" size="small" onClick={() => gerarContraChequePdf(month, 1660.63)}>
                      Gerar Contra-Cheque
                    </Button>
                  </Stack>
                ) : (
                  <Button variant="outlined" size="small" disabled>
                    Gerar Relatório
                  </Button>
                )}
              </Box>
            </AccordionSummary>

            <AccordionDetails>
              <Stack direction="column" spacing={1}>
                {month.days.map((p) => (
                  <Paper key={p.id} sx={{ p: 1.5, bgcolor: "#252525", borderRadius: 2 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography sx={{ color: "#fff" }}>
                        {(() => {
                          const [y, m, d] = p.id.split("-");
                          return `${d}/${m}/${y}`;
                        })()}
                      </Typography>

                      <Stack direction="row" spacing={1} alignItems="center">
                        {temPermissao && (
                          <IconButton size="small" color="primary" onClick={() => openEditModal(p)} title="Editar ponto">
                            <EditIcon />
                          </IconButton>
                        )}
                        <Chip label={`${p.status || "OK"}`} size="small" sx={{ bgcolor: "#333", color: "white", fontWeight: "bold" }} />
                      </Stack>
                    </Stack>

                    <Typography variant="body2" color="#bbb" sx={{ mt: 1 }}>
                      Entrada: {p.entrada || "-"} | Saída Int.: {p.intervaloSaida || "-"} | Volta Int.: {p.intervaloVolta || "-"} | Saída: {p.saida || "-"}
                    </Typography>

                    <Typography variant="body2" color="#999" sx={{ mt: 0.5 }}>
                      ⏰ Total: {minutesToHHMM(calcMinutesWorkedForDay(p))}
                    </Typography>

                    {p.atestadoUrl && (
                      <Box mt={1}>
                        <a href={p.atestadoUrl} target="_blank" rel="noopener noreferrer">
                          📎 Ver Atestado
                        </a>
                      </Box>
                    )}

                    <Stack direction="row" spacing={1} mt={1}>
                      <Button variant="outlined" color="info" component="label" size="small" startIcon={<PhotoCamera />}>
                        Enviar Atestado
                        <input hidden type="file" accept="image/*,application/pdf" onChange={(e) => handleUploadAtestado(p.id, e.target.files[0])} />
                      </Button>
                      {temPermissao && (
                        <IconButton color="error" onClick={() => handleExcluirPonto(p.id)}>
                          <DeleteForeverIcon />
                        </IconButton>
                      )}
                      {temPermissao && (
                        <Button size="small" variant="outlined" onClick={() => clearTimestamp(p.id, "saida")}>
                          Limpar Saída
                        </Button>
                      )}
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </AccordionDetails>
          </Accordion>
        ))}
      </Paper>

      {/* EDIT DIALOG */}
      <Dialog open={editOpen} onClose={closeEditModal} fullWidth maxWidth="sm">
        <DialogTitle>Editar Ponto - {editDayId}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Entrada (HH:MM)" value={editValues.entrada} onChange={(e) => handleEditChange("entrada", e.target.value)} placeholder="08:00" fullWidth />
            <TextField label="Saída Intervalo (HH:MM)" value={editValues.intervaloSaida} onChange={(e) => handleEditChange("intervaloSaida", e.target.value)} placeholder="12:00" fullWidth />
            <TextField label="Volta Intervalo (HH:MM)" value={editValues.intervaloVolta} onChange={(e) => handleEditChange("intervaloVolta", e.target.value)} placeholder="13:00" fullWidth />
            <TextField label="Saída (HH:MM)" value={editValues.saida} onChange={(e) => handleEditChange("saida", e.target.value)} placeholder="17:00" fullWidth />
            <FormControl fullWidth>
              <InputLabel id="status-label">Status</InputLabel>
              <Select labelId="status-label" value={editValues.status} label="Status" onChange={(e) => handleEditChange("status", e.target.value)}>
                {STATUS_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="#bbb">
              Deixe campos vazios para removê-los.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditModal} color="inherit">
            Cancelar
          </Button>
          <Button onClick={saveEdit} variant="contained">
            Salvar alterações
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
} // fim do componente

// Converte minutos para formato HH:MM
function minutesToHHMM(minutos) {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// cálculo de minutos trabalhados por dia (suporta virada de dia)
function calcMinutesWorkedForDay(p) {
  const toMin = (t) => {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const e = toMin(p.entrada);
  const isOut = toMin(p.intervaloSaida);
  const iv = toMin(p.intervaloVolta);
  const s = toMin(p.saida);

  let total = 0;
  if (e != null && isOut != null) total += minutesDiff(e, isOut);
  if (iv != null && s != null) total += minutesDiff(iv, s);

  return total;
}

// groupByMonth for outside helper usage if needed
function groupByMonth(pontosList) {
  const map = new Map();

  pontosList.forEach((p) => {
    if (!p?.id) return;
    const [y, m, d] = p.id.split("-").map(Number);
    const monthKey = `${y}-${String(m).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      year: "numeric",
    }).format(new Date(y, m - 1, 1));

    if (!map.has(monthKey)) map.set(monthKey, { label, days: [], totalMinutes: 0 });

    const entry = map.get(monthKey);
    entry.days.push(p);
    entry.totalMinutes += calcMinutesWorkedForDay(p);
  });

  return Array.from(map.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([monthKey, v]) => ({
      monthKey,
      ...v,
      days: v.days.sort((a, b) => a.id.localeCompare(b.id)), // garante ordem dos dias
    }));
}
