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

const ADMIN_UID = "mD3ie8YGmgaup2VVDpKuMBltXgp2";
const THRESHOLD = 0.55;
const BRAZIL_TZ = "America/Sao_Paulo";

// localStorage key for regional holidays config
const LS_KEY_REGIONAIS = "ponto_feriados_regionais_v1";

export default function FuncionarioPerfil() {
  const { lojaId, funcionarioId } = useParams();
  const navigate = useNavigate();

  const [funcData, setFuncData] = useState(null);
  const [pontos, setPontos] = useState([]);
  const [lojaNome, setLojaNome] = useState("");
  const [mode, setMode] = useState("view"); // view | enroll
  const [isAdmin, setIsAdmin] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [uploadingAtestado, setUploadingAtestado] = useState(false);

  // UI state for regional holidays text area
  const [regionalHolidaysText, setRegionalHolidaysText] = useState("");
  const [regionalHolidaysParsed, setRegionalHolidaysParsed] = useState([]);

  // --- NEW: states for inline capture (enroll) ---
// coloque com os outros useState
const [capturing, setCapturing] = useState(false);
const [captureError, setCaptureError] = useState(null);
const [capturedPreview, setCapturedPreview] = useState(null); // <-- preview local da captura
const videoRef = useRef(null);
const mediaStreamRef = useRef(null);

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
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsAdmin(!!user && user.uid === ADMIN_UID);
    });
    return () => unsub();
  }, []);

  // Carrega modelos e dados iniciais
  useEffect(() => {
    (async () => {
      try {
        console.log("FUNC-PERF: inicializando modelos...");
        await loadFaceApiModels();
        // garante nets do faceapi (fallback)
        const MODEL_URL = "/models";
        if (!faceapi.nets.ssdMobilenetv1.params) {
          console.log(
            "FUNC-PERF: faceapi.nets não carregados — carregando via faceapi.loadFromUri..."
          );
          await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          ]);
        }
        console.log("FUNC-PERF: modelos carregados com sucesso.");
      } catch (err) {
        console.warn("FUNC-PERF: Falha ao carregar modelos face-api:", err);
      }
      await carregarLoja();
      await carregarFuncionario();
      await carregarPontos();
      await verificarFolgaAutomatica();
      // load regionais from localStorage
      loadRegionaisFromStorage();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaId, funcionarioId]);

  const loadRegionaisFromStorage = () => {
    try {
      const raw = localStorage.getItem(LS_KEY_REGIONAIS);
      if (raw) {
        setRegionalHolidaysText(raw);
        const parsed = parseRegionalHolidaysText(raw);
        setRegionalHolidaysParsed(parsed);
      } else {
        // default empty
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

  const carregarFuncionario = async () => {
    try {
      const funcSnap = await getDoc(doc(db, "lojas", lojaId, "funcionarios", funcionarioId));
      if (funcSnap.exists()) {
        const d = funcSnap.data();
        setFuncData(d);
        console.log("FUNC-PERF: Dados do funcionário carregados:", { id: funcionarioId, ...d });
      } else {
        console.warn("FUNC-PERF: Funcionário não encontrado no Firestore.");
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
      const hoje = getHojeId();
      const docRef = doc(db, "lojas", lojaId, "funcionarios", funcionarioId, "pontos", hoje);
      let snap;
      try {
        snap = await getDoc(docRef, { source: "server" });
      } catch {
        snap = await getDoc(docRef);
      }

      const horaAtual = getHoraAtualLocal();
      let dados = snap.exists() ? { ...snap.data() } : { data: hoje, status: "OK" };
      const pontosHoje = [
        dados.entrada,
        dados.intervaloSaida,
        dados.intervaloVolta,
        dados.saida,
      ].filter(Boolean).length;
      if (pontosHoje >= 4) {
        alert("⚠️ Todos os pontos do dia já foram marcados.");
        return;
      }
      if (!dados.entrada) dados.entrada = horaAtual;
      else if (!dados.intervaloSaida) dados.intervaloSaida = horaAtual;
      else if (!dados.intervaloVolta) dados.intervaloVolta = horaAtual;
      else if (!dados.saida) dados.saida = horaAtual;
      await setDoc(docRef, dados, { merge: true });
      await carregarPontos();
      alert("✅ Ponto registrado com sucesso!");
      setMode("view");
    } catch (err) {
      console.error("FUNC-PERF: ❌ Erro onVerifyPunchSuccess:", err);
      alert("Erro ao registrar ponto.");
    }
  };

  // --- Função que tenta detectar diretamente no <video> (como Painel), com fallback para canvas/dataURL ---
  const performLiveRecognitionAndPunch = async ({ attemptsTimeout = 9000, intervalMs = 800 } = {}) => {
    if (isAdmin) {
      await onVerifyPunchSuccess();
      return;
    }

    if (!funcData?.faceDescriptor || !Array.isArray(funcData.faceDescriptor)) {
      alert("⚠️ Nenhuma foto de referência cadastrada para este funcionário.");
      return;
    }

    // checar modelos carregados
    if (!faceapi.nets.ssdMobilenetv1.params || !faceapi.nets.faceRecognitionNet.params) {
      console.warn("FUNC-PERF: modelos faceapi podem não estar prontos. Tentando carregar novamente...");
      try {
        const MODEL_URL = "/models";
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ]);
        console.log("FUNC-PERF: modelos (re)carregados.");
      } catch (err) {
        console.error("FUNC-PERF: não foi possível carregar modelos:", err);
        alert("Erro: modelos de reconhecimento não estão prontos. Veja console.");
        return;
      }
    }

    let stream = null;
    let video = null;
    const storedDesc = arrayToDescriptor(funcData.faceDescriptor);

    try {
      console.log("FUNC-PERF: solicitando permissão da câmera...");
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      console.log("FUNC-PERF: permissão concedida, iniciando elemento video...");

      video = document.createElement("video");
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;
      video.width = 420;
      video.height = 320;
      video.style.position = "fixed";
      video.style.right = "16px";
      video.style.top = "16px";
      video.style.zIndex = 9999;
      video.style.border = "2px solid rgba(255,255,255,0.12)";
      video.style.borderRadius = "8px";
      video.style.background = "#000";
      document.body.appendChild(video);

      video.srcObject = stream;

      await new Promise((res) => {
        const onCan = () => {
          video.removeEventListener("loadeddata", onCan);
          setTimeout(res, 250);
        };
        video.addEventListener("loadeddata", onCan);
        setTimeout(res, 1500);
      });

      console.log("FUNC-PERF: vídeo pronto. iniciando loop de detecção por até", attemptsTimeout, "ms");

      const start = Date.now();
      let matched = false;

      while (Date.now() - start < attemptsTimeout && !matched) {
        // 1) Tenta detectar direto no elemento video usando faceapi (método do Painel)
        let detection = null;
        try {
          detection = await faceapi
            .detectSingleFace(video, new faceapi.SsdMobilenetv1Options())
            .withFaceLandmarks()
            .withFaceDescriptor();
        } catch (err) {
          console.warn("FUNC-PERF: faceapi.detectSingleFace(video) falhou:", err);
          detection = null;
        }

        if (detection && detection.descriptor) {
          console.log("FUNC-PERF: rosto detectado via video. comparando...");
          const liveDesc = detection.descriptor;
          const { match, distance } = compareDescriptors(storedDesc, liveDesc, THRESHOLD);
          console.log("FUNC-PERF: comparação -> match:", match, "distância:", typeof distance === "number" ? distance.toFixed(3) : distance);
          if (match) {
            matched = true;
            console.log("FUNC-PERF: ✅ Reconhecimento via video OK — registrando ponto...");
            await onVerifyPunchSuccess();
            break;
          } else {
            console.log("FUNC-PERF: rosto detectado via video, mas não confere. tentando próxima iteração...");
          }
        } else {
          // 2) fallback: captura frame em canvas -> dataURL -> util getFaceDescriptorFromMedia
          try {
            // cria canvas temporário
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth || 420;
            canvas.height = video.videoHeight || 320;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL("image/jpeg");
            // console debug
            console.log("FUNC-PERF: nenhum detection direto — executando fallback via canvas -> dataURL");
            const imgEl = await createImageElementFromDataUrl(dataUrl);
            if (imgEl) {
              const liveDesc = await getFaceDescriptorFromMedia(imgEl);
              if (liveDesc) {
                console.log("FUNC-PERF: descriptor obtido via fallback. comparando...");
                const { match, distance } = compareDescriptors(storedDesc, liveDesc, THRESHOLD);
                console.log("FUNC-PERF: comparação fallback -> match:", match, "distância:", typeof distance === "number" ? distance.toFixed(3) : distance);
                if (match) {
                  matched = true;
                  console.log("FUNC-PERF: ✅ Reconhecimento via fallback OK — registrando ponto...");
                  await onVerifyPunchSuccess();
                  break;
                } else {
                  console.log("FUNC-PERF: fallback detectou rosto, mas não confere.");
                }
              } else {
                console.log("FUNC-PERF: fallback não detectou rosto no frame.");
              }
            } else {
              console.log("FUNC-PERF: createImageElementFromDataUrl retornou null no fallback.");
            }
          } catch (err) {
            console.warn("FUNC-PERF: erro no fallback (canvas/dataUrl):", err);
          }
        }

        // espera antes de tentar novamente
        await new Promise((r) => setTimeout(r, intervalMs));
      }

      if (!matched) {
        console.log("FUNC-PERF: não houve match após tentativas.");
        alert("😕 Não foi possível reconhecer o rosto. Tente novamente com mais luz e olhando para a câmera.");
      }
    } catch (err) {
      console.error("FUNC-PERF: Erro durante reconhecimento ao vivo:", err);
      alert("Erro ao acessar a câmera ou durante o reconhecimento. Veja o console para detalhes.");
    } finally {
      // cleanup
      try {
        if (stream) stream.getTracks().forEach((t) => t.stop());
        if (video && video.parentNode) video.parentNode.removeChild(video);
        console.log("FUNC-PERF: cleanup concluído (stream + video removidos).");
      } catch (err) {
        console.warn("FUNC-PERF: erro no cleanup:", err);
      }
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
    if (!isAdmin) return alert("Somente o administrador pode excluir pontos.");
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
    if (!isAdmin) return alert("Somente admin pode editar pontos.");
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
      // updateDoc merges only provided fields, but firebase doesn't delete keys when set to null via update
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
    if (!isAdmin) return alert("Somente admin pode fazer isso.");
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

  // ============================
  // Helpers: parse regional holidays text
  // ============================
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

  // ============================
  // gerarRelatorio (PDF)
  // ============================
  const gerarRelatorio = async (monthObj) => {
    try {
      const [yearStr, monthStr] = monthObj.monthKey.split("-");
      const ano = Number(yearStr);
      const mesIndex = Number(monthStr) - 1;
      const nomeMes = new Date(ano, mesIndex, 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });
      const funcionario = funcData || {};
      const loja = lojaNome || lojaId;

      let feriadosNacionais = [];
      try {
        const resp = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
        if (resp.ok) {
          const json = await resp.json();
          feriadosNacionais = json.map((f) => ({ dateIso: f.date, date: formatDateToDDMM(f.date), name: f.name }));
        } else {
          console.warn("gerarRelatorio: BrasilAPI retornou não-ok:", resp.status);
        }
      } catch (err) {
        console.warn("gerarRelatorio: falha ao buscar feriados nacionais:", err);
      }

      const feriadosRegionaisFromText = parseRegionalHolidaysText(regionalHolidaysText);
      const todosFeriados = [...feriadosNacionais, ...feriadosRegionaisFromText];

      const rows = [];
      let totalMinutesMonth = 0;
      const daysSorted = [...monthObj.days].sort((a, b) => a.id.localeCompare(b.id));
      for (const p of daysSorted) {
        const iso = p.id;
        const dateObj = new Date(iso + "T00:00:00");
        const dataFormatada = iso.split("-").reverse().join("/");
        const weekday = dateObj.toLocaleDateString("pt-BR", { weekday: "long" });
        const ddmm = formatDateToDDMM(iso);

        const feriadoMatchIso = todosFeriados.find((f) => f.dateIso === iso);
        const feriadoMatchDDMM = todosFeriados.find((f) => f.date === ddmm && !f.dateIso);
        const feriadoMatch = feriadoMatchIso || feriadoMatchDDMM;

        const diaLabel = feriadoMatch ? `${capitalize(weekday)} (Feriado)` : capitalize(weekday);

        let entradaCell = p.entrada || "-";
        let saidaIntCell = p.intervaloSaida || "-";
        let voltaIntCell = p.intervaloVolta || "-";
        let saidaCell = p.saida || "-";

        if (p.status && p.status !== "OK") {
          entradaCell = saidaIntCell = voltaIntCell = saidaCell = p.status;
        }

        const minutosDia = calcMinutesWorkedForDay(p);
        totalMinutesMonth += minutosDia;

        rows.push([
          dataFormatada,
          diaLabel,
          entradaCell,
          saidaIntCell,
          voltaIntCell,
          saidaCell,
        ]);
      }

      const doc = new jsPDF({ unit: "pt", format: "a4" });

      doc.setFontSize(16);
      doc.text("Relatório Mensal de Pontos", 40, 50);
      doc.setFontSize(11);
      doc.text(`Funcionário: ${funcionario.nome || "-"}`, 40, 72);
      doc.text(`Loja: ${loja}`, 40, 88);
      doc.text(`Mês de referência: ${capitalize(nomeMes)}`, 40, 104);

      autoTable(doc, {
        startY: 125,
        head: [["Data", "Dia", "Entrada", "Saída Int.", "Volta Int.", "Saída"]],
        body: rows,
        theme: "grid",
        headStyles: { fillColor: [41, 128, 185] },
        styles: { fontSize: 10, cellPadding: 6 },
        margin: { left: 40, right: 40 },
      });

      const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 140;
      let offset = finalY + 20;
      const feriadosNoMes = todosFeriados.filter((f) => {
        if (f.dateIso) {
          return f.dateIso.startsWith(`${ano}-${String(mesIndex + 1).padStart(2, "0")}`);
        }
        if (f.date) {
          const parts = f.date.split("/");
          if (parts.length >= 2) {
            const mm = parts[1];
            return mm === String(mesIndex + 1).padStart(2, "0");
          }
        }
        return false;
      });

      if (feriadosNoMes.length > 0) {
        doc.setFontSize(12);
        doc.text("Feriados no mês:", 40, offset);
        offset += 16;
        doc.setFontSize(10);
        feriadosNoMes.forEach((f) => {
          const label = `${f.date}${f.name ? " — " + f.name : ""}`;
          doc.text(label, 50, offset);
          offset += 14;
        });
      }

      const totalHH = Math.floor(totalMinutesMonth / 60);
      const totalMM = totalMinutesMonth % 60;
      const totalTexto = `${totalHH}h ${totalMM}m`;

      doc.setFontSize(12);
      doc.text(`Total de horas trabalhadas no mês: ${totalTexto}`, 40, offset + 24);

      const nomeArquivo = `Relatorio_${capitalize(nomeMes).replace(/\s+/g, "")}_${funcionario.nome ? slugify(funcionario.nome) : funcionarioId}.pdf`;
      doc.save(nomeArquivo);
    } catch (err) {
      console.error("gerarRelatorio: erro:", err);
      alert("Erro ao gerar relatório. Veja o console para detalhes.");
    }
  };

  // ============================
  // NEW: capture functions (inline enroll)
  // ============================
  const openCameraForCapture = async () => {
  if (!isAdmin) {
    alert("Apenas admin pode atualizar foto.");
    return;
  }
  setCaptureError(null);
  setCapturedPreview(null);
  setCapturing(true);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    mediaStreamRef.current = stream;

    if (videoRef.current) {
      try {
        videoRef.current.srcObject = stream;
      } catch (e) {
        // navegador pode lançar ao setar srcObject; fallback abaixo
        videoRef.current.src = window.URL.createObjectURL(stream);
      }

      // garante que o autoplay carregue antes de permitir captura
      await new Promise((res) => {
        const onLoaded = () => {
          if (videoRef.current) videoRef.current.removeEventListener("loadeddata", onLoaded);
          // pequeno delay para garantir frame estável
          setTimeout(res, 250);
        };
        videoRef.current.addEventListener("loadeddata", onLoaded);
        // fallback timeout
        setTimeout(res, 1500);
      });
    }
  } catch (err) {
    console.error("Erro ao abrir câmera para captura:", err);
    setCaptureError("Não foi possível acessar a câmera. Verifique permissões.");
    stopCaptureStream();
    setCapturing(false);
  }
};

const stopCaptureStream = () => {
  try {
    const s = mediaStreamRef.current;
    if (s && s.getTracks) {
      s.getTracks().forEach((t) => t.stop());
    }
  } catch (err) {
    console.warn("Erro ao parar stream:", err);
  } finally {
    mediaStreamRef.current = null;
    if (videoRef.current) {
      try {
        // remove srcObject e src para evitar vazamento e liberar recurso
        if ("srcObject" in videoRef.current) videoRef.current.srcObject = null;
        videoRef.current.src = "";
      } catch (e) {
        // ignore
      }
    }
  }
};

const cancelCapture = () => {
  stopCaptureStream();
  setCapturing(false);
  setCaptureError(null);
  setCapturedPreview(null);
};

const captureAndSavePhoto = async () => {
  if (!videoRef.current) {
    alert("Video element ausente.");
    return;
  }
  if (!mediaStreamRef.current) {
    alert("Câmera não iniciada.");
    return;
  }

  try {
    // desenha frame atual
    const videoEl = videoRef.current;
    const w = videoEl.videoWidth || 640;
    const h = videoEl.videoHeight || 480;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(videoEl, 0, 0, w, h);

    // pega dataURL para preview imediato
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setCapturedPreview(dataUrl); // mostra preview instantaneamente na UI

    // converte pra blob (aguarda)
    const blob = await new Promise((res) => canvas.toBlob((b) => res(b), "image/jpeg", 0.9));
    if (!blob) throw new Error("Falha ao converter imagem.");

    // IMPORTANTE: não paramos a stream ainda — deixamos até upload e update DB acontecerem
    // Faz upload e atualiza Firestore
    let imageUrl = null;
    try {
      // opcional: feedback para o usuário (ex: "Enviando...")
      imageUrl = await uploadImage(blob); // await o upload
    } catch (uploadErr) {
      console.error("Erro no upload da imagem:", uploadErr);
      throw new Error("Erro ao enviar imagem ao servidor.");
    }

    // atualiza doc do funcionário
    try {
      await updateDoc(doc(db, "lojas", lojaId, "funcionarios", funcionarioId), {
        fotoReferencia: imageUrl,
        // faceDescriptor é gerado abaixo se conseguir extrair
      });
      // atualiza o state localmente pra refletir imediatamente
      setFuncData((prev) => ({ ...(prev || {}), fotoReferencia: imageUrl }));
    } catch (dbErr) {
      console.error("Erro ao salvar URL no Firestore:", dbErr);
      // mesmo se falhar no DB, continuamos para tentar extrair descriptor e notificar
    }

    // tenta extrair descriptor a partir do dataUrl (sem depender do upload)
    try {
      const imgEl = await createImageElementFromDataUrl(dataUrl);
      const desc = await getFaceDescriptorFromMedia(imgEl);
      if (desc) {
        await updateDoc(doc(db, "lojas", lojaId, "funcionarios", funcionarioId), {
          faceDescriptor: descriptorToArray(desc),
        });
        // atualiza funcData local com faceDescriptor
        setFuncData((prev) => ({ ...(prev || {}), faceDescriptor: descriptorToArray(desc) }));
      } else {
        console.warn("Não foi possível extrair descriptor da imagem capturada.");
      }
    } catch (descErr) {
      console.warn("Erro ao extrair descriptor:", descErr);
    }

    // sucesso
    alert("Foto salva com sucesso!");
  } catch (err) {
    console.error("Erro ao capturar/salvar foto:", err);
    setCaptureError(err.message || "Erro ao capturar/salvar foto.");
    alert("Erro ao capturar/salvar foto. Veja console.");
  } finally {
    // garantimos cleanup sempre
    stopCaptureStream();
    setCapturing(false);
    // observação: mantemos capturedPreview para que o usuário veja o preview mesmo após fechar câmera
    // se quiser que o preview vá embora após X segundos, podemos limpar aqui:
    // setTimeout(() => setCapturedPreview(null), 5000);
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
          onClick={() => navigate(isAdmin ? `/admin/loja/${lojaId}` : "/painel")}
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
              <Avatar src={funcData.fotoReferencia} sx={{ width: 100, height: 100, margin: "0 auto" }} />
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
          {isAdmin && (
            <Button variant="contained" color="warning" startIcon={<AddAPhotoIcon />} sx={{ mt: 2 }} onClick={() => {
              setMode("enroll");
              setTimeout(() => openCameraForCapture(), 150);
            }}>
              Atualizar Foto
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
          <Button variant="contained" color="success" startIcon={<CameraAltIcon />} onClick={requestPunchWithFace} fullWidth>
            Bater Ponto
          </Button>
        </Box>

        <Divider sx={{ my: 3, bgcolor: "#333" }} />

        {/* CONFIG UI: Feriados Regionais */}
        {isAdmin && (
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
          Histórico de Pontos
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
              <Grid container spacing={1}>
                {month.days.map((p) => (
                  <Grid item xs={12} key={p.id}>
                    <Paper sx={{ p: 1.5, bgcolor: "#252525", borderRadius: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography sx={{ color: "#fff" }}>{p.id}</Typography>
                        <Stack direction="row" spacing={1} alignItems="center">
                          {isAdmin && (
                            <IconButton size="small" color="primary" onClick={() => openEditModal(p)} title="Editar ponto">
                              <EditIcon />
                            </IconButton>
                          )}
                          <Chip label={`${p.status || "OK"}`} size="small" sx={{ bgcolor: "#333", color: "white", fontWeight: "bold" }} />
                        </Stack>
                      </Stack>
                      <Typography variant="body2" color="#bbb" sx={{ mt: 1 }}>
                        Entrada: {p.entrada || "-"} | Saída Intervalo: {p.intervaloSaida || "-"} | Volta: {p.intervaloVolta || "-"} | Saída: {p.saida || "-"}
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
                        <IconButton color="error" onClick={() => handleExcluirPonto(p.id)}>
                          <DeleteForeverIcon />
                        </IconButton>
                        {isAdmin && (
                          <Button size="small" variant="outlined" onClick={() => clearTimestamp(p.id, 'saida')}>
                            Limpar Saída
                          </Button>
                        )}
                      </Stack>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
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

// ---------------------------
// Additional helpers (outside component)
// ---------------------------

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
}
