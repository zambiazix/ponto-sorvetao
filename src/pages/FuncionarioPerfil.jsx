// src/pages/FuncionarioPerfil.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { auth, db } from "../services/firebase";
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
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddAPhotoIcon from "@mui/icons-material/AddAPhoto";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import CancelIcon from "@mui/icons-material/Cancel";
import PhotoCamera from "@mui/icons-material/PhotoCamera";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import EditIcon from "@mui/icons-material/Edit";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import SaveIcon from "@mui/icons-material/Save";
import RestoreIcon from "@mui/icons-material/SettingsBackupRestore";

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

// constants
const ADMIN_UID = "mD3ie8YGmgaup2VVDpKuMBltXgp2";
const THRESHOLD = 0.55;
const BRAZIL_TZ = "America/Sao_Paulo";

// localStorage key for regional holidays config
const LS_KEY_REGIONAIS = "ponto_feriados_regionais_v1";

export default function FuncionarioPerfil() {
  const { lojaId, funcionarioId } = useParams();
  const navigate = useNavigate();

  // main states
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

  // dialog for editing a point (admin)
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPoint, setEditingPoint] = useState(null);
  const [editingFields, setEditingFields] = useState({
    entrada: "",
    intervaloSaida: "",
    intervaloVolta: "",
    saida: "",
    status: "",
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsAdmin(!!user && user.uid === ADMIN_UID);
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const funcSnap = await getDoc(
        doc(db, "lojas", lojaId, "funcionarios", funcionarioId)
      );
      if (funcSnap.exists()) {
        const d = funcSnap.data();
        setFuncData(d);
        console.log("FUNC-PERF: Dados do funcionário carregados:", {
          id: funcionarioId,
          ...d,
        });
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
      const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: BRAZIL_TZ }).format(
        new Date()
      );
      if (/^\d{4}-\d{2}-\d{2}$/.test(hoje)) return hoje;
    } catch (err) {}
    const agora = new Date();
    return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(agora.getDate()).padStart(2, "0")}`;
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
      const agoraSP = new Date(
        new Date().toLocaleString("en-US", { timeZone: BRAZIL_TZ })
      );
      if (agoraSP.getHours() < 16) return;
      const hoje = getHojeId();
      const docRef = doc(
        db,
        "lojas",
        lojaId,
        "funcionarios",
        funcionarioId,
        "pontos",
        hoje
      );
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
      const docRef = doc(
        db,
        "lojas",
        lojaId,
        "funcionarios",
        funcionarioId,
        "pontos",
        hoje
      );
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
      await updateDoc(
        doc(db, "lojas", lojaId, "funcionarios", funcionarioId, "pontos", dayId),
        {
          atestadoUrl: url,
          atestadoUploadedAt: serverTimestamp(),
        }
      );
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
      await deleteDoc(
        doc(db, "lojas", lojaId, "funcionarios", funcionarioId, "pontos", dayId)
      );
      await carregarPontos();
      alert("🗑️ Ponto excluído com sucesso!");
    } catch {
      alert("Erro ao excluir ponto.");
    }
  };

  // open edit dialog (admin)
  const openEditDialog = (p) => {
    if (!isAdmin) return alert("Somente admin pode editar pontos.");
    setEditingPoint(p);
    setEditingFields({
      entrada: p.entrada || "",
      intervaloSaida: p.intervaloSaida || "",
      intervaloVolta: p.intervaloVolta || "",
      saida: p.saida || "",
      status: p.status || "OK",
    });
    setEditDialogOpen(true);
  };

  const saveEditedPoint = async () => {
    if (!editingPoint) return;
    const docRef = doc(db, "lojas", lojaId, "funcionarios", funcionarioId, "pontos", editingPoint.id);
    try {
      await updateDoc(docRef, {
        entrada: editingFields.entrada || null,
        intervaloSaida: editingFields.intervaloSaida || null,
        intervaloVolta: editingFields.intervaloVolta || null,
        saida: editingFields.saida || null,
        status: editingFields.status || "OK",
        updatedAt: serverTimestamp(),
      });
      await carregarPontos();
      alert("Ponto atualizado!");
      setEditDialogOpen(false);
    } catch (err) {
      console.error("Erro ao salvar ponto editado:", err);
      alert("Erro ao salvar alterações.");
    }
  };

  // helpers time conversion
  const toMinutes = (t) => {
    if (!t) return null;
    const [h, m] = t.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };

  // ---------- NEW LOGIC: tratar saídas que ocorrem na madrugada ----------
  // Regra descrita:
  // - Se existir 'intervaloVolta' (volta do intervalo), usamos ela como referência:
  //     saída será considerada parte do mesmo expediente se ocorrer até N horas após a volta do intervalo.
  // - Se NÃO existir 'intervaloVolta', usamos a 'entrada' como referência, mas com um limite maior.
  // Parâmetros configuráveis:
  const MAX_HOURS_AFTER_VOLTA = 8; // horas após volta do intervalo (ex.: 8h)
  const MAX_HOURS_AFTER_ENTRADA_FALLBACK = 14; // se não houver volta do intervalo, 14h após entrada

  function shouldAssociateSaidaWithSameDay(p) {
    // p: objeto ponto com campos entrada, intervaloSaida, intervaloVolta, saida (strings 'HH:MM')
    if (!p || !p.saida) return false;
    // if there's a volta do intervalo, prefer that
    const ref = p.intervaloVolta || p.entrada;
    if (!ref) return false;
    const refMinutes = toMinutes(ref);
    const saidaMinutes = toMinutes(p.saida);
    if (refMinutes == null || saidaMinutes == null) return false;

    // if saida >= ref -> same day obviously
    if (saidaMinutes >= refMinutes) return true;

    // if saida < ref, it's probably in next day -> measure difference considering wrap-around
    // compute minutes difference considering next day:
    const diffIfNextDay = saidaMinutes + 24 * 60 - refMinutes; // minutes from ref to next-day saida

    if (p.intervaloVolta) {
      // use MAX_HOURS_AFTER_VOLTA
      return diffIfNextDay <= MAX_HOURS_AFTER_VOLTA * 60;
    } else {
      // fallback to entrada
      return diffIfNextDay <= MAX_HOURS_AFTER_ENTRADA_FALLBACK * 60;
    }
  }

  // calcula minutos trabalhados no dia, considerando saída possivelmente no dia seguinte
  const calcMinutesWorkedForDay = (p) => {
    // p: { entrada, intervaloSaida, intervaloVolta, saida }
    // strategy: compute first segment (entrada -> intervaloSaida) if present and valid
    // then second segment (intervaloVolta -> saida) if present and valid
    // if saida appears to be next day, adjust accordingly (add 24h)
    const parse = (t) => (t ? toMinutes(t) : null);
    const e = parse(p.entrada);
    const isOut = parse(p.intervaloSaida);
    let iv = parse(p.intervaloVolta);
    let s = parse(p.saida);

    // if saida is present and should be associated with previous day but s < reference, add 24h to s
    if (s != null) {
      // choose reference as intervaloVolta when exists, else entrada
      const ref = iv != null ? iv : e;
      if (ref != null && s < ref) {
        // check association rule
        if (shouldAssociateSaidaWithSameDay(p)) {
          s = s + 24 * 60;
        } else {
          // otherwise, interpret saída as belonging to next day's record (i.e., don't count here)
          // We'll return totals only from segments that close within the day
          // So we treat s as null (no valid saída for this day)
          s = null;
        }
      }
    }

    let total = 0;
    // first segment
    if (e != null && isOut != null && isOut > e) total += isOut - e;
    // second segment
    if (iv != null && s != null && s > iv) total += s - iv;

    // if there is no interval but whole shift is entrada->saida (no intervalo), allow e->s
    if ((isOut == null || iv == null) && e != null && s != null && s > e) {
      // ensure we didn't double-count e->s if we already counted isOut->iv above
      // if isOut && iv present then above already accounted; but if they are absent, add e->s
      // check that s not already consumed by second segment (we added only when iv && s)
      const countedViaSegments = (e != null && isOut != null && isOut > e) || (iv != null && s != null && s > iv);
      if (!countedViaSegments) {
        total = s - e;
      }
    }

    return Math.max(0, Math.round(total));
  };

  const minutesToHHMM = (mins) => {
    const h = Math.floor(mins / 60) || 0;
    const m = Math.round(mins % 60) || 0;
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
  // Accepts lines like:
  // YYYY-MM-DD - Nome do feriado
  // DD/MM - Nome do feriado
  // DD/MM/YYYY - Nome do feriado
  // or just the date (no name)
  const parseRegionalHolidaysText = (text) => {
    if (!text) return [];
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const out = [];
    for (const line of lines) {
      // try "date - name"
      const parts = line.split("-");
      const datePart = parts[0].trim();
      const namePart = parts.slice(1).join("-").trim() || "Feriado Local";

      // detect iso YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        out.push({ dateIso: datePart, date: formatDateToDDMM(datePart), name: namePart });
        continue;
      }
      // detect dd/mm or dd/mm/yyyy
      if (/^\d{2}\/\d{2}(\/\d{4})?$/.test(datePart)) {
        // if no year, keep as dd/mm format (dateIso null)
        if (/^\d{2}\/\d{2}$/.test(datePart)) {
          out.push({ dateIso: null, date: datePart, name: namePart });
        } else {
          // dd/mm/yyyy -> convert to ISO
          const [dd, mm, yyyy] = datePart.split("/");
          const iso = `${yyyy}-${mm}-${dd}`;
          out.push({ dateIso: iso, date: formatDateToDDMM(iso), name: namePart });
        }
        continue;
      }
      // fallback: ignore or try parseable date
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

  // Convert YYYY-MM-DD -> DD/MM
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

  // Verifica feriado: junta feriados nacionais via BrasilAPI + regionais do texto salvo
  const isFeriado = async (isoDate) => {
    // isoDate: YYYY-MM-DD
    // check regional cached parsed first (by dd/mm or iso)
    const ddmm = formatDateToDDMM(isoDate);
    const regionalMatch = (regionalHolidaysParsed || []).find((f) => f.dateIso === isoDate || f.date === ddmm);
    if (regionalMatch) return { ok: true, source: "regional", name: regionalMatch.name, date: regionalMatch.date };
    // fallback to brasilapi (we could cache per year)
    const ano = isoDate.slice(0, 4);
    try {
      const resp = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
      if (!resp.ok) return { ok: false };
      const json = await resp.json();
      const found = json.find((f) => f.date === isoDate);
      if (found) return { ok: true, source: "nacional", name: found.name, date: formatDateToDDMM(found.date) };
    } catch (err) {
      console.warn("isFeriado: erro ao consultar BrasilAPI:", err);
    }
    return { ok: false };
  };

  // ============================
  // Função: gerarRelatorio (PDF)
  // ============================
  const gerarRelatorio = async (monthObj) => {
    try {
      // monthObj.monthKey = "YYYY-MM"
      const [yearStr, monthStr] = monthObj.monthKey.split("-");
      const ano = Number(yearStr);
      const mesIndex = Number(monthStr) - 1; // 0-based
      const nomeMes = new Date(ano, mesIndex, 1).toLocaleString("pt-BR", { month: "long", year: "numeric" });
      const funcionario = funcData || {};
      const loja = lojaNome || lojaId;

      // 1) buscar feriados nacionais pelo ano (BrasilAPI)
      let feriadosNacionais = [];
      try {
        const resp = await fetch(`https://brasilapi.com.br/api/feriados/v1/${ano}`);
        if (resp.ok) {
          const json = await resp.json();
          // json tem objetos com date (YYYY-MM-DD) e name
          feriadosNacionais = json.map((f) => ({
            dateIso: f.date, // YYYY-MM-DD
            date: formatDateToDDMM(f.date),
            name: f.name,
          }));
        } else {
          console.warn("gerarRelatorio: BrasilAPI retornou não-ok:", resp.status);
        }
      } catch (err) {
        console.warn("gerarRelatorio: falha ao buscar feriados nacionais:", err);
      }

      // 2) usar feriados regionais do estado (texto do usuário)
      const feriadosRegionaisFromText = parseRegionalHolidaysText(regionalHolidaysText);

      // 3) juntar feriados: nacionais + regionais (regionais podem ter dateIso or dd/mm)
      const todosFeriados = [...feriadosNacionais, ...feriadosRegionaisFromText];

      // 4) tabela: para cada dia do mês, preferimos mostrar todos os dias do mês (1..N)
      // mas você pediu que a lista seja "dos pontos batidos naquele mês, separados por dia".
      // Interpretarei que quer uma linha por dia do mês com os dados (se houver ponto mostra horários, se não houver mostra FOLGA ou status)
      // Construir linhas para cada dia do mês
      const rows = [];
      let totalMinutesMonth = 0;
      const daysInMonth = new Date(ano, mesIndex + 1, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const dd = String(day).padStart(2, "0");
        const mm = String(mesIndex + 1).padStart(2, "0");
        const iso = `${ano}-${mm}-${dd}`; // YYYY-MM-DD
        const p = monthObj.days.find((d) => d.id === iso);
        const dateObj = new Date(iso + "T00:00:00");
        const weekday = dateObj.toLocaleDateString("pt-BR", { weekday: "long" });
        const ddmm = formatDateToDDMM(iso);

        // procura matching feriado: prefer iso exact match, fallback by dd/mm
        const feriadoMatchIso = todosFeriados.find((f) => f.dateIso === iso);
        const feriadoMatchDDMM = todosFeriados.find((f) => f.date === ddmm && !f.dateIso);
        const feriadoMatch = feriadoMatchIso || feriadoMatchDDMM;

        const diaLabel = feriadoMatch ? `${capitalize(weekday)} (Feriado)` : capitalize(weekday);

        let entradaCell = "-";
        let saidaIntCell = "-";
        let voltaIntCell = "-";
        let saidaCell = "-";

        if (p) {
          entradaCell = p.entrada || "-";
          saidaIntCell = p.intervaloSaida || "-";
          voltaIntCell = p.intervaloVolta || "-";
          saidaCell = p.saida || "-";

          if (p.status && p.status !== "OK") {
            entradaCell = saidaIntCell = voltaIntCell = saidaCell = p.status;
          }
          const minutosDia = calcMinutesWorkedForDay(p);
          totalMinutesMonth += minutosDia;
        } else {
          // sem registro -> FOLGA
          entradaCell = saidaIntCell = voltaIntCell = saidaCell = "FOLGA";
        }

        rows.push([
          `${dd}/${mm}/${ano}`,
          diaLabel,
          entradaCell,
          saidaIntCell,
          voltaIntCell,
          saidaCell,
        ]);
      }

      // 5) gera PDF com jsPDF + autotable
      const doc = new jsPDF({
        unit: "pt",
        format: "a4",
      });

      doc.setFontSize(16);
      doc.text("Relatório Mensal de Pontos", 40, 50);
      doc.setFontSize(11);
      doc.text(`Funcionário: ${funcionario.nome || "-"}`, 40, 72);
      doc.text(`Loja: ${loja}`, 40, 88);
      doc.text(`Mês de referência: ${capitalize(nomeMes)}`, 40, 104);

      // tabela
      autoTable(doc, {
        startY: 125,
        head: [["Data", "Dia", "Entrada", "Saída Int.", "Volta Int.", "Saída"]],
        body: rows,
        theme: "grid",
        headStyles: { fillColor: [41, 128, 185] },
        styles: { fontSize: 9, cellPadding: 6 },
        margin: { left: 40, right: 40 },
        columnStyles: {
          0: { cellWidth: 70 },
          1: { cellWidth: 110 },
          // rest auto
        },
      });

      // adiciona lista de feriados regionais (se houver) antes do total
      const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY : 140;
      let offset = finalY + 20;
      // filtra feriados que pertencem ao mês do relatório
      const feriadosNoMes = todosFeriados.filter((f) => {
        // if has dateIso -> check year/month
        if (f.dateIso) {
          return f.dateIso.startsWith(`${ano}-${String(mesIndex + 1).padStart(2, "0")}`);
        }
        // if only dd/mm -> check dd/mm against month
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

      // total horas
      const totalHH = Math.floor(totalMinutesMonth / 60);
      const totalMM = totalMinutesMonth % 60;
      const totalTexto = `${totalHH}h ${totalMM}m`;

      doc.setFontSize(12);
      doc.text(`Total de horas trabalhadas no mês: ${totalTexto}`, 40, offset + 24);

      // salvar - padrão de nome solicitado
      const nomeArquivo = `Relatorio_${capitalize(nomeMes).replace(/\s+/g, "")}_${funcionario.nome ? slugify(funcionario.nome) : funcionarioId}.pdf`;
      doc.save(nomeArquivo);
    } catch (err) {
      console.error("gerarRelatorio: erro:", err);
      alert("Erro ao gerar relatório. Veja o console para detalhes.");
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

  // UI render
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
            <Button variant="contained" color="warning" startIcon={<AddAPhotoIcon />} sx={{ mt: 2 }} onClick={() => setMode("enroll")}>
              Atualizar Foto
            </Button>
          )}
        </Box>

        {mode === "enroll" && (
          <Paper sx={{ p: 2, bgcolor: "#2a2a2a", borderRadius: 2, textAlign: "center" }}>
            <Typography mb={1} sx={{ color: "#fff" }}>
              Capture uma foto de referência
            </Typography>
            <WebcamCapture
              captureLabel="Salvar foto"
              onCapture={async (blob, dataUrl) => {
                try {
                  if (!isAdmin) return alert("Apenas admin pode cadastrar foto.");
                  const imageUrl = await uploadImage(blob);
                  const imgEl = await createImageElementFromDataUrl(dataUrl);
                  const desc = await getFaceDescriptorFromMedia(imgEl);
                  if (!desc) return alert("Rosto não detectado.");
                  await updateDoc(doc(db, "lojas", lojaId, "funcionarios", funcionarioId), {
                    fotoReferencia: imageUrl,
                    faceDescriptor: descriptorToArray(desc),
                  });
                  await carregarFuncionario();
                  alert("Foto salva!");
                  setMode("view");
                } catch (err) {
                  console.error("FUNC-PERF: Erro enroll:", err);
                  alert("Erro ao salvar foto.");
                }
              }}
              facingMode="user"
            />
            <Button startIcon={<CancelIcon />} variant="outlined" color="inherit" sx={{ mt: 2 }} onClick={() => setMode("view")}>
              Cancelar
            </Button>
          </Paper>
        )}

        <Box textAlign="center" mt={2}>
          <Button variant="contained" color="success" startIcon={<CameraAltIcon />} onClick={requestPunchWithFace} fullWidth>
            Bater Ponto
          </Button>
        </Box>

        <Divider sx={{ my: 3, bgcolor: "#333" }} />

        {/* CONFIG UI: Feriados Regionais (somente admin) */}
        {isAdmin && (
          <Paper sx={{ p: 2, mb: 2, bgcolor: "#222", borderRadius: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Box>
                <Typography variant="subtitle1" sx={{ color: "#fff" }}>
                  Feriados Regionais (configuração)
                </Typography>
                <Typography variant="caption" color="#bbb" sx={{ display: "block" }}>
                  Formatos por linha: <code>YYYY-MM-DD - Nome</code> ou <code>DD/MM - Nome</code> ou <code>DD/MM/YYYY - Nome</code>.
                </Typography>
              </Box>
              <Stack direction="row" spacing={1}>
                <Button size="small" startIcon={<SaveIcon />} onClick={() => saveRegionaisToStorage(regionalHolidaysText)} variant="contained">Salvar</Button>
                <Button size="small" startIcon={<RestoreIcon />} onClick={() => { loadRegionaisFromStorage(); alert("Restaurado das configurações salvas."); }} variant="outlined">Restaurar</Button>
                <Button size="small" color="error" onClick={() => { clearRegionais(); alert("Feriados regionais limpos."); }} variant="outlined">Limpar</Button>
              </Stack>
            </Stack>

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
                  <Button variant="outlined" size="small" startIcon={<PictureAsPdfIcon />} onClick={() => gerarRelatorio(month)}>
                    Gerar Relatório
                  </Button>
                ) : (
                  <Button variant="outlined" size="small" disabled startIcon={<PictureAsPdfIcon />}>
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
                          <Chip label={`${p.status || "OK"}`} size="small" sx={{ bgcolor: "#333", color: "white", fontWeight: "bold" }} />
                          {isAdmin && (
                            <>
                              <IconButton size="small" color="primary" onClick={() => openEditDialog(p)}>
                                <EditIcon />
                              </IconButton>
                              <IconButton size="small" color="error" onClick={() => handleExcluirPonto(p.id)}>
                                <DeleteForeverIcon />
                              </IconButton>
                            </>
                          )}
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
                      </Stack>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            </AccordionDetails>
          </Accordion>
        ))}
      </Paper>

      {/* Edit dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Editar Ponto — {editingPoint?.id}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField label="Entrada (HH:MM)" value={editingFields.entrada} onChange={(e) => setEditingFields((s) => ({ ...s, entrada: e.target.value }))} />
            <TextField label="Saída Intervalo (HH:MM)" value={editingFields.intervaloSaida} onChange={(e) => setEditingFields((s) => ({ ...s, intervaloSaida: e.target.value }))} />
            <TextField label="Volta Intervalo (HH:MM)" value={editingFields.intervaloVolta} onChange={(e) => setEditingFields((s) => ({ ...s, intervaloVolta: e.target.value }))} />
            <TextField label="Saída (HH:MM)" value={editingFields.saida} onChange={(e) => setEditingFields((s) => ({ ...s, saida: e.target.value }))} />
            <TextField label="Status (OK / FOLGA / ATESTADO / FÉRIAS ...)" value={editingFields.status} onChange={(e) => setEditingFields((s) => ({ ...s, status: e.target.value }))} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)} startIcon={<CancelIcon />}>Cancelar</Button>
          <Button onClick={saveEditedPoint} variant="contained" startIcon={<SaveIcon />}>Salvar</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

// ---------------------------
// Additional helpers (outside component)
// ---------------------------

// Converte minutos para formato HH:MM (2 dígitos)
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
  // fallback full shift
  if ((!isOut || !iv) && e && s && s > e) total = s - e;
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
