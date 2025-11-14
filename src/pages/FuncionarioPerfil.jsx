// (Arquivo completo) FuncionarioPerfil.jsx
// --- início do arquivo ---
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
import "jspdf-autotable";
import ConsentDialogs from "../components/ConsentDialogs"; // ajuste o path conforme sua estrutura

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
  // UI state for regional holidays text area
  const [regionalHolidaysText, setRegionalHolidaysText] = useState("");
  const [regionalHolidaysParsed, setRegionalHolidaysParsed] = useState([]);
  // --- NEW: states for edit modal ---
  const [editOpen, setEditOpen] = useState(false);
  const [editDayId, setEditDayId] = useState(null);
  const [editValues, setEditValues] = useState({
    entrada: "",
    intervaloSaida: "",
    intervaloVolta: "",
    saida: "",
    status: "OK",
  });
  const STATUS_OPTIONS = ["OK", "FOLGA", "ATESTADO", "FALTA", "FÉRIAS", "SUSPENSÃO", "DISPENSA"];

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
// Carrega modelos e dados iniciais
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
}, [lojaId, funcionarioId]);

// 🚀 Pré-carrega permissão da câmera ao abrir o perfil do funcionário
useEffect(() => {
  navigator.mediaDevices
    .getUserMedia({ video: true })
    .then((stream) => {
      // Fecha o stream imediatamente após o preload
      stream.getTracks().forEach((t) => t.stop());
      console.log("📸 Permissão de câmera pré-carregada no perfil!");
    })
    .catch(() => {
      console.warn("⚠️ Usuário negou a permissão de câmera antecipadamente.");
    });
}, []);

// Descriptor salvo do funcionário (se houver)
const storedDesc = funcData?.faceDescriptor ? arrayToDescriptor(funcData.faceDescriptor) : null;

// 🚀 Pré-carregamento invisível da câmera e bloqueio de duplo clique
const lastRecognitionAt = { value: 0 }; // simple mutable holder to avoid re-entrancy across renders

const performLiveRecognitionAndPunch = async ({ attemptsTimeout = 9000, intervalMs = 800 } = {}) => {
  // evita cliques repetidos muito próximos
  const MIN_INTERVAL_MS = 2500;
  const now = Date.now();
  if (now - lastRecognitionAt.value < MIN_INTERVAL_MS) {
    console.warn("Clique ignorado — tentativa muito próxima da anterior.");
    return;
  }
  lastRecognitionAt.value = now;

  if (reconhecimentoEmAndamento) {
    console.warn("⏳ Reconhecimento já em andamento — clique ignorado.");
    return;
  }

  setReconhecimentoEmAndamento(true);
  let stream = null;
  let video = null;
  let didCallPunch = false;

  try {
    // 🔥 Pré-aquecimento invisível da câmera (não bloqueante se falhar)
    try {
      const warmupStream = await navigator.mediaDevices.getUserMedia({ video: true });
      warmupStream.getTracks().forEach((t) => t.stop());
      console.log("FUNC-PERF: câmera pré-aquecida com sucesso (warmup).");
    } catch (preErr) {
      console.warn("⚠️ FUNC-PERF: falha no pré-aquecimento da câmera (pode não haver dispositivo ou permissão negada).", preErr);
      // não retornamos aqui porque em muitos dispositivos a permissão só aparece ao solicitar o stream real
    }

    // Verifica descriptor obrigatório
    if (!storedDesc) {
      alert("⚠️ Nenhuma foto cadastrada para reconhecimento facial.");
      return;
    }

    // solicita stream real
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    } catch (getErr) {
      console.error("FUNC-PERF: erro ao acessar câmera:", getErr);
      if (getErr && getErr.name === "NotFoundError") {
        alert("Nenhuma câmera encontrada neste dispositivo.");
      } else if (getErr && getErr.name === "NotAllowedError") {
        alert("Permissão para usar a câmera negada. Atualize as permissões do navegador.");
      } else {
        alert("Erro ao acessar a câmera. Veja o console para detalhes.");
      }
      return;
    }

    // cria vídeo invisível e prende à DOM para que face-api possa ler frames
    video = document.createElement("video");
    Object.assign(video, {
      autoplay: true,
      playsInline: true,
      muted: true,
      width: 420,
      height: 320,
    });
    Object.assign(video.style, {
      position: "fixed",
      right: "16px",
      top: "16px",
      zIndex: -9999,
      opacity: 0,
      pointerEvents: "none",
      width: "1px",
      height: "1px",
    });
    video.srcObject = stream;
    document.body.appendChild(video);

    // aguarda primeiro frame
    await new Promise((res, rej) => {
      const timeout = setTimeout(() => {
        rej(new Error("Timeout ao carregar vídeo da câmera"));
      }, 3000);
      video.onloadeddata = () => {
        clearTimeout(timeout);
        // delay pequeno para garantir frames
        setTimeout(res, 150);
      };
    });

    console.log("FUNC-PERF: vídeo pronto — iniciando detecção facial...");
    const start = Date.now();
    let matched = false;

    while (Date.now() - start < attemptsTimeout && !matched) {
      // detectSingleFace aceita HTMLVideoElement
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.SsdMobilenetv1Options())
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection && detection.descriptor) {
        const distance = faceapi.euclideanDistance(storedDesc, detection.descriptor);
        const match = distance < 0.45;
        console.log(`🧩 Distância: ${distance.toFixed(3)} — match: ${match}`);

        if (match) {
          matched = true;
          console.log("✅ Rosto reconhecido! Registrando ponto...");
          // chama o registro apenas uma vez
          await onVerifyPunchSuccess();
          didCallPunch = true;
          break;
        }
      }

      // espera antes de tentar de novo
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    if (!matched && !didCallPunch) {
      // mostra instrução caso não encontrado
      console.log("FUNC-PERF: rosto não reconhecido no período definido.");
      alert("😕 Não foi possível reconhecer o rosto. Tente novamente com mais luz e segurando o dispositivo mais estável.");
    }
  } catch (err) {
    console.error("❌ Erro durante reconhecimento facial:", err);
    // erro já tratado em mensagens específicas, só alerta genérico aqui
    alert("Erro durante o reconhecimento facial. Veja console para detalhes.");
  } finally {
    // limpeza segura
    try {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (video && video.parentNode) video.parentNode.removeChild(video);
    } catch (cleanupErr) {
      console.warn("Erro na limpeza do stream/video:", cleanupErr);
    }
    setReconhecimentoEmAndamento(false);
    console.log("FUNC-PERF: cleanup concluído (stream e vídeo fechados).");
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
    const url = await uploadImage(file);
    await updateDoc(doc(db, "lojas", lojaId, "funcionarios", funcionarioId, "pontos", dayId), {
      atestadoUrl: url,
      atestadoUploadedAt: serverTimestamp(),
    });
    await carregarPontos();
    alert("📄 Atestado enviado com sucesso!");
  } catch {
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

const calcMinutesWorkedForDay = (p) => {
  const e = toMinutes(p.entrada),
    isOut = toMinutes(p.intervaloSaida),
    iv = toMinutes(p.intervaloVolta),
    s = toMinutes(p.saida);
  let total = 0;
  if (e && isOut && isOut > e) total += isOut - e;
  if (iv && s && s > iv) total += s - iv;
  return total;
};

const minutesToHHMM = (mins) => {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${m}m`;
};

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

const formatDateToDDMM = (isoDate) => {
  try {
    const d = new Date(isoDate + "T00:00:00");
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}`;
  } catch {
    return isoDate;
  }
};
// ==== GERAR RELATÓRIO (PDF) ====
const gerarRelatorio = async (monthObj) => {
  try {
    const [yearStr, monthStr] = monthObj.monthKey.split("-");
    const ano = Number(yearStr);
    const mesIndex = Number(monthStr) - 1;
    const nomeMes = new Date(ano, mesIndex, 1).toLocaleString("pt-BR", {
      month: "long",
      year: "numeric",
    });

    const funcionario = funcData || {};
    const loja = lojaNome || lojaId;

    // ====== BAIXA FERIADOS NACIONAIS ======
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

    // ====== FERIADOS REGIONAIS ======
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

    // ===== LINHAS =====
    const rows = [];
    let totalMinutesMonth = 0;
    const diasNoMes = new Date(ano, mesIndex + 1, 0).getDate();

    for (let dia = 1; dia <= diasNoMes; dia++) {
      const iso = `${ano}-${String(mesIndex + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      const p = (monthObj.days || []).find((d) => d.id === iso) || {};
      const weekday = new Date(iso + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long" });
      const ddmm = formatDateToDDMM(iso);
      const feriadoMatch = feriadosMap.get(iso) || feriadosMap.get(ddmm);
      const diaLabel = feriadoMatch ? `${capitalize(weekday)} (Feriado)` : capitalize(weekday);

      let entradaCell = p.entrada || "-";
      let saidaIntCell = p.intervaloSaida || "-";
      let voltaIntCell = p.intervaloVolta || "-";
      let saidaCell = p.saida || "-";

      if (p.status && p.status !== "OK") {
        entradaCell = saidaIntCell = voltaIntCell = saidaCell = p.status;
      }

      let minutosDia = 0;
      try {
        minutosDia = calcMinutesWorkedForDay(p) || 0;
      } catch {
        minutosDia = 0;
      }
      totalMinutesMonth += minutosDia;

      rows.push([
        iso.split("-").reverse().join("/"),
        diaLabel,
        entradaCell,
        saidaIntCell,
        voltaIntCell,
        saidaCell,
      ]);
    }

    // ===== PDF =====
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.setFont("helvetica", "normal");
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginLeft = 40;
    const marginRight = 40;
    const usableWidth = pageWidth - marginLeft - marginRight;

    // Cabeçalho
    doc.setFontSize(16);
    doc.text(`Relatório de Ponto - ${capitalize(nomeMes)}`, marginLeft, 40, { maxWidth: usableWidth });

    doc.setFontSize(11);
    doc.text(`Funcionário: ${funcionario.nome || funcionarioId}`, marginLeft, 60, { maxWidth: usableWidth });
    doc.text(`Loja: ${loja}`, marginLeft, 76, { maxWidth: usableWidth });
    doc.text(`Gerado em: ${new Date().toLocaleDateString("pt-BR")}`, marginLeft, 92, { maxWidth: usableWidth });

    // ===== TABELA =====
    autoTable(doc, {
      startY: 110,
      head: [["Data", "Dia", "Entrada", "Saída Int.", "Volta Int.", "Saída"]],
      body: rows,
      theme: "striped", // <--- ativa zebra
      margin: { left: marginLeft, right: marginRight },
      styles: {
        fontSize: 10,
        cellPadding: 6,
        textColor: 0,
        lineColor: [0, 0, 0],
        lineWidth: 0.1,
        overflow: "hidden", // impede quebra
        valign: "middle",
      },
      headStyles: {
        fillColor: [41, 128, 185],
        textColor: 255,
        fontStyle: "bold",
        halign: "left",
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245], // zebra
      },
      columnStyles: {
        0: { cellWidth: 70, halign: "left" },
        1: { cellWidth: usableWidth - (70 + 50 * 4), halign: "left" },
        2: { cellWidth: 50, halign: "center" },
        3: { cellWidth: 50, halign: "center" },
        4: { cellWidth: 50, halign: "center" },
        5: { cellWidth: 50, halign: "center" },
      },
    });

    // ===== PÓS-TABELA =====
    const tableFinalY = doc.lastAutoTable.finalY || 140;
    let yCursor = tableFinalY + 20;

    // ===== FERIADOS =====
    const feriadosNoMes = Array.from(feriadosMap.values()).filter((f) => {
      if (f.dateIso) return f.dateIso.startsWith(`${ano}-${String(mesIndex + 1).padStart(2, "0")}`);
      if (f.date) {
        const [d, m] = f.date.split("/");
        return m === String(mesIndex + 1).padStart(2, "0");
      }
      return false;
    });

    doc.setFontSize(12);
    if (feriadosNoMes.length > 0) {
      doc.text("Feriados no mês:", marginLeft, yCursor);
      yCursor += 14;
      doc.setFontSize(10);

      for (const f of feriadosNoMes) {
        if (yCursor > doc.internal.pageSize.getHeight() - 60) {
          doc.addPage();
          yCursor = 40;
        }
        const dataFmt = f.dateIso ? f.dateIso.split("-").reverse().join("/") : f.date;
        const tipo = f.type || "Regional";
        const nomeF = f.name || "(sem nome)";
        const linha = `- ${dataFmt} — ${nomeF} (${tipo})`;
        doc.text(linha, marginLeft + 8, yCursor, { maxWidth: usableWidth - 16 });
        yCursor += 12;
      }
    } else {
      doc.text("Feriados no mês: nenhum registrado.", marginLeft, yCursor);
      yCursor += 14;
    }

    // ===== TOTAL =====
    yCursor += 10;
    const totalFmt = minutesToHHMM(totalMinutesMonth || 0);
    doc.setFontSize(11);
    doc.text(`Total de horas trabalhadas no mês: ${totalFmt}`, marginLeft, yCursor + 6);

    // ===== SALVAR =====
    const safeNomeMes = capitalize(nomeMes).replace(/\s+/g, "");
    const nomeArquivo = `Relatorio_${safeNomeMes}_${funcionario.nome ? slugify(funcionario.nome) : funcionarioId}.pdf`;
    doc.save(nomeArquivo);
  } catch (err) {
    console.error("gerarRelatorio: erro:", err);
    alert("Erro ao gerar relatório. Veja o console para detalhes.");
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
    const detection = await faceapi
      .detectSingleFace(img)
      .withFaceLandmarks()
      .withFaceDescriptor();

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
    setFuncData((prev) => ({
      ...prev,
      fotoReferencia: imageUrl,
      faceDescriptor: descriptorArray,
    }));

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

    // 4) Opcional: garante consistência lendo do servidor (bom pra debug)
    // await carregarFuncionario();

    console.log("✅ Foto atualizada com sucesso:", imageUrl);
    alert("✅ Foto atualizada com sucesso!");
  } catch (error) {
    console.error("Erro ao enviar foto:", error);
    alert("Erro ao enviar a foto. Veja console.");
  } finally {
    setUploading(false);
    // limpa input se quiser: e.target.value = null; // cuidado com controlaçao
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
    mx: "auto",      // centraliza horizontalmente dentro do Box
    display: "block" // garante comportamento consistente
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
        {/* MODE === enroll: inline capture UI */}
        {mode === "enroll" && (
  <Paper sx={{ p: 2, bgcolor: "#2a2a2a", borderRadius: 2, textAlign: "center" }}>
    <Typography mb={1} sx={{ color: "#fff" }}>
      Capture uma foto de referência (apenas 1 foto; a câmera fechará automaticamente após a captura)
    </Typography>
    {capturing ? (
      <>
        <Box sx={{ display: "flex", justifyContent: "center", mb: 1 }}>
          <video
            ref={videoRef}
            style={{ width: 360, height: 270, borderRadius: 8, background: "#000", border: "2px solid #333" }}
            autoPlay
            playsInline
            muted
          />
        </Box>
        <Stack direction="row" spacing={1} justifyContent="center">
          <Button variant="contained" color="success" onClick={captureAndSavePhoto} startIcon={<CameraAltIcon />}>
            Capturar
          </Button>
          <Button variant="outlined" color="inherit" onClick={() => { cancelCapture(); setMode("view"); }}>
            Cancelar
          </Button>
        </Stack>
        {captureError && <Typography color="error" sx={{ mt: 1 }}>{captureError}</Typography>}
      </>
    ) : (
      <>
        <Typography variant="body2" color="#bbb" sx={{ mb: 1 }}>
          Clique em abrir câmera para iniciar. A câmera será fechada automaticamente após a captura.
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="center">
          <Button variant="contained" onClick={openCameraForCapture} size="small">Abrir Câmera</Button>
          <Button variant="outlined" onClick={() => { setMode("view"); }} size="small">Cancelar</Button>
        </Stack>
      </>
    )}
    {/* Preview local exibido se existir */}
    {capturedPreview && (
      <Box sx={{ mt: 2, display: "flex", justifyContent: "center" }}>
        <img src={capturedPreview} alt="Preview captura" style={{ maxWidth: 360, borderRadius: 8, border: "2px solid #2b2b2b" }} />
      </Box>
    )}
  </Paper>
)}
        <Box textAlign="center" mt={2}>
          <Button
  variant="contained"
  color="success"
  startIcon={<CameraAltIcon />}
  onClick={requestPunchWithFace}
  fullWidth
  disabled={reconhecimentoEmAndamento} // impede duplo clique
>
  {reconhecimentoEmAndamento ? "Reconhecendo..." : "Bater Ponto"}
</Button>
        </Box>
        <Divider sx={{ my: 3, bgcolor: "#333" }} />
        {/* CONFIG UI: Feriados Regionais */}
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
              <Button variant="outlined" size="small" onClick={() => { loadRegionaisFromStorage(); alert("Restaurado das configurações salvas."); }}>
                Restaurar Salvo
              </Button>
              <Button variant="outlined" size="small" onClick={() => { clearRegionais(); alert("Feriados regionais limpos."); }}>
                Limpar
              </Button>
            </Stack>
          </Paper>
        )}
        <Typography variant="h6" mb={2} sx={{ color: "#fff", display: "flex", alignItems: "center", gap: 1 }}>
          📝 Histórico de Ponto
        </Typography>
        {months.map((month) => (
          <Accordion key={month.monthKey} defaultExpanded={month.monthKey === currentMonthKey} sx={{ bgcolor: "#1a1a1a", color: "white", mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: "#fff" }} />}>
              <Box sx={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
                <Typography sx={{ textTransform: "capitalize" }}>{month.label} — ⏱️ {minutesToHHMM(month.totalMinutes)}</Typography>
                {isAdmin ? (
                  <Button variant="outlined" size="small" onClick={() => gerarRelatorio(month)}>
                    Gerar Relatório
                  </Button>
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
              // Formata p.id que é "YYYY-MM-DD" para "DD/MM/YYYY"
              const [y, m, d] = p.id.split("-");
              return `${d}/${m}/${y}`;
            })()}
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center">
            {temPermissao && (
              <IconButton
                size="small"
                color="primary"
                onClick={() => openEditModal(p)}
                title="Editar ponto"
              >
                <EditIcon />
              </IconButton>
            )}
            <Chip
              label={`${p.status || "OK"}`}
              size="small"
              sx={{ bgcolor: "#333", color: "white", fontWeight: "bold" }}
            />
          </Stack>
        </Stack>

        <Typography variant="body2" color="#bbb" sx={{ mt: 1 }}>
          Entrada: {p.entrada || "-"} | Saída Intervalo: {p.intervaloSaida || "-"} | Volta:{" "}
          {p.intervaloVolta || "-"} | Saída: {p.saida || "-"}
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
          <Button
            variant="outlined"
            color="info"
            component="label"
            size="small"
            startIcon={<PhotoCamera />}
          >
            Enviar Atestado
            <input
              hidden
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => handleUploadAtestado(p.id, e.target.files[0])}
            />
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
            <TextField
              label="Entrada (HH:MM)"
              value={editValues.entrada}
              onChange={(e) => handleEditChange('entrada', e.target.value)}
              placeholder="08:00"
              fullWidth
            />
            <TextField
              label="Saída Intervalo (HH:MM)"
              value={editValues.intervaloSaida}
              onChange={(e) => handleEditChange('intervaloSaida', e.target.value)}
              placeholder="12:00"
              fullWidth
            />
            <TextField
              label="Volta Intervalo (HH:MM)"
              value={editValues.intervaloVolta}
              onChange={(e) => handleEditChange('intervaloVolta', e.target.value)}
              placeholder="13:00"
              fullWidth
            />
            <TextField
              label="Saída (HH:MM)"
              value={editValues.saida}
              onChange={(e) => handleEditChange('saida', e.target.value)}
              placeholder="17:00"
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel id="status-label">Status</InputLabel>
              <Select
                labelId="status-label"
                value={editValues.status}
                label="Status"
                onChange={(e) => handleEditChange('status', e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="#bbb">Deixe campos vazios para removê-los.</Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEditModal} color="inherit">Cancelar</Button>
          <Button onClick={saveEdit} variant="contained">Salvar alterações</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
// Converte minutos para formato HH:MM
function minutesToHHMM(minutos) {
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
// Helpers reuse (same logic as inside)
function calcMinutesWorkedForDay(p) {
  const toMinutesLocal = (t) => {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const e = toMinutesLocal(p.entrada),
    isOut = toMinutesLocal(p.intervaloSaida),
    iv = toMinutesLocal(p.intervaloVolta),
    s = toMinutesLocal(p.saida);
  let total = 0;
  if (e && isOut && isOut > e) total += isOut - e;
  if (iv && s && s > iv) total += s - iv;
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