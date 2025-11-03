// src/pages/FuncionarioPerfil.jsx
import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
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
  TextField,
  MenuItem,
  Grid,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  IconButton,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import AddAPhotoIcon from "@mui/icons-material/AddAPhoto";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import CancelIcon from "@mui/icons-material/Cancel";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import PhotoCamera from "@mui/icons-material/PhotoCamera";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";

import { uploadImage } from "../services/cloudinary";
import WebcamCapture from "../components/WebcamCapture";
import {
  loadFaceApiModels,
  getFaceDescriptorFromMedia,
  descriptorToArray,
  arrayToDescriptor,
  compareDescriptors,
  createImageElementFromDataUrl,
} from "../utils/faceRecognition";

const ADMIN_UID = "mD3ie8YGmgaup2VVDpKuMBltXgp2";
const THRESHOLD = 0.55;
const BRAZIL_TZ = "America/Sao_Paulo";

export default function FuncionarioPerfil() {
  const { lojaId, funcionarioId } = useParams();
  const navigate = useNavigate();

  const [funcData, setFuncData] = useState(null);
  const [pontos, setPontos] = useState([]);
  const [lojaNome, setLojaNome] = useState("");
  const [mode, setMode] = useState("view"); // view | enroll | verify-punch
  const [isAdmin, setIsAdmin] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [uploadingAtestado, setUploadingAtestado] = useState(false);

  // novo estado para evitar chamadas duplicadas durante verificação automática
  const [verificando, setVerificando] = useState(false);

  const statusList = ["OK", "FALTA", "ATESTADO", "FÉRIAS", "SUSPENSÃO", "DISPENSA", "FOLGA"];

  const statusEmojis = {
    OK: "✅",
    FALTA: "❌",
    ATESTADO: "📄",
    FÉRIAS: "🏖️",
    SUSPENSÃO: "⚠️",
    DISPENSA: "👋",
    FOLGA: "😎",
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsAdmin(!!user && user.uid === ADMIN_UID);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadFaceApiModels();
      } catch (err) {
        console.warn("Falha ao carregar modelos face-api:", err);
      }
      await carregarLoja();
      await carregarFuncionario();
      await carregarPontos();
      await verificarFolgaAutomatica();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaId, funcionarioId]);

  const carregarLoja = async () => {
    try {
      const lojaSnap = await getDoc(doc(db, "lojas", lojaId));
      if (lojaSnap.exists()) setLojaNome(lojaSnap.data().nome);
    } catch (err) {
      console.error("Erro carregarLoja:", err);
    }
  };

  const carregarFuncionario = async () => {
    try {
      const funcSnap = await getDoc(doc(db, "lojas", lojaId, "funcionarios", funcionarioId));
      if (funcSnap.exists()) setFuncData(funcSnap.data());
    } catch (err) {
      console.error("Erro carregarFuncionario:", err);
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
    } catch (err) {
      console.error("Erro carregarPontos:", err);
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
      console.error("Erro verificarFolgaAutomatica:", err);
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
      if (pontosHoje >= 4) return alert("⚠️ Todos os pontos do dia já foram marcados.");
      if (!dados.entrada) dados.entrada = horaAtual;
      else if (!dados.intervaloSaida) dados.intervaloSaida = horaAtual;
      else if (!dados.intervaloVolta) dados.intervaloVolta = horaAtual;
      else if (!dados.saida) dados.saida = horaAtual;
      await setDoc(docRef, dados, { merge: true });
      await carregarPontos();
      alert("✅ Ponto registrado com sucesso!");
      setMode("view");
    } catch (err) {
      console.error("❌ Erro onVerifyPunchSuccess:", err);
      alert("Erro ao registrar ponto.");
    }
  };

  // Substitui a função verifyLiveAgainstReference
const verifyLiveAgainstReference = async (dataUrl) => {
  try {
    if (!funcData?.faceDescriptor) {
      console.warn("Funcionário sem faceDescriptor cadastrado.");
      return false;
    }

    const img = await createImageElementFromDataUrl(dataUrl);
    if (!img) {
      console.warn("❌ Nenhuma imagem criada a partir do frame.");
      return false;
    }

    const liveDesc = await getFaceDescriptorFromMedia(img);
    if (!liveDesc) {
      console.warn("❌ Nenhum rosto detectado neste frame.");
      return false;
    }

    const storedDesc = arrayToDescriptor(funcData.faceDescriptor);
    const { match, distance } = compareDescriptors(storedDesc, liveDesc, THRESHOLD);
    console.log("🔍 Comparação facial -> match:", match, "distância:", distance?.toFixed?.(3));

    if (match) {
      console.log("✅ Rosto reconhecido com sucesso! Registrando ponto...");
      await onVerifyPunchSuccess();
      return true; // sinaliza sucesso -> encerra loop
    }

    return false; // continua tentando
  } catch (err) {
    console.error("❌ Erro durante verificação facial:", err);
    return false;
  }
};

  const requestPunchWithFace = async () => {
    if (isAdmin) return onVerifyPunchSuccess();
    if (!funcData?.faceDescriptor) return alert("⚠️ Nenhuma foto de referência cadastrada!");
    setMode("verify-punch");
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
            <Button
              variant="contained"
              color="warning"
              startIcon={<AddAPhotoIcon />}
              sx={{ mt: 2 }}
              onClick={() => setMode("enroll")}
            >
              Atualizar Foto
            </Button>
          )}
        </Box>

        {mode === "enroll" && (
          <Paper sx={{ p: 2, bgcolor: "#2a2a2a", borderRadius: 2, textAlign: "center" }}>
            <Typography mb={1} sx={{ color: "#fff" }}>Capture uma foto de referência</Typography>
            <WebcamCapture captureLabel="Salvar foto" onCapture={async (blob, dataUrl) => {
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
                console.error("Erro enroll:", err);
                alert("Erro ao salvar foto.");
              }
            }} facingMode="user" />
            <Button startIcon={<CancelIcon />} variant="outlined" color="inherit" sx={{ mt: 2 }} onClick={() => setMode("view")}>Cancelar</Button>
          </Paper>
        )}

        {mode === "verify-punch" && (
          <Paper sx={{ p: 2, bgcolor: "#2a2a2a", borderRadius: 2, textAlign: "center" }}>
            <Typography mb={1} sx={{ color: "#fff" }}>
              Posicione o rosto — a verificação será feita automaticamente
            </Typography>
            <WebcamCapture
              autoCapture
              hideControls
              facingMode="user"
              frameInterval={1000} // captura 1 frame/segundo
              onFrame={async (blob, dataUrl) => {
                // Proteção: se já estivermos verificando, ignora frames adicionais
                if (verificando) {
                  return false;
                }

                try {
                  // transforma dataUrl em img
                  const img = await createImageElementFromDataUrl(dataUrl);
                  if (!img) {
                    console.log("❌ createImageElementFromDataUrl retornou null.");
                    return false;
                  }

                  const liveDesc = await getFaceDescriptorFromMedia(img);
                  if (!liveDesc) {
                    console.log("❌ Nenhum rosto detectado neste frame.");
                    return false;
                  }

                  const storedArr = funcData?.faceDescriptor || null;
                  if (!storedArr) {
                    console.log("⚠️ Funcionário sem faceDescriptor cadastrado.");
                    return false;
                  }

                  const storedDesc = arrayToDescriptor(storedArr);
                  const { match, distance } = compareDescriptors(storedDesc, liveDesc, THRESHOLD);
                  console.log("Comparação facial -> match:", match, "dist:", typeof distance === "number" ? distance.toFixed(3) : distance);

                  if (match) {
                    try {
                      // Evita reentrância
                      setVerificando(true);
                      console.log("✅ Rosto reconhecido — chamando onVerifyPunchSuccess()");
                      await onVerifyPunchSuccess();
                      // retornando true sinalizamos ao componente de webcam que deu match
                      return true;
                    } finally {
                      // deixa como false só depois de pequena espera para evitar loops rápidos
                      setTimeout(() => setVerificando(false), 500);
                    }
                  }

                  // não houve match; continuar tentando
                  return false;
                } catch (err) {
                  console.warn("Erro durante verificação automática:", err);
                  return false;
                }
              }}
            />
            <Button
              startIcon={<CancelIcon />}
              variant="outlined"
              color="inherit"
              sx={{ mt: 2 }}
              onClick={() => setMode("view")}
            >
              Cancelar
            </Button>
          </Paper>
        )}

        {mode === "view" && (
          <Box textAlign="center" mt={2}>
            <Button
              variant="contained"
              color="success"
              startIcon={<CameraAltIcon />}
              onClick={requestPunchWithFace}
              fullWidth
            >
              Bater Ponto
            </Button>
          </Box>
        )}

        <Divider sx={{ my: 3, bgcolor: "#333" }} />

        <Typography variant="h6" mb={2} sx={{ color: "#fff", display: "flex", alignItems: "center", gap: 1 }}>
          Histórico de Pontos
        </Typography>

        {months.map((month) => (
          <Accordion key={month.monthKey} defaultExpanded={month.monthKey === currentMonthKey} sx={{ bgcolor: "#1a1a1a", color: "white", mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: "#fff" }} />}>
              <Typography sx={{ textTransform: "capitalize" }}>
                {month.label} — ⏱️ {minutesToHHMM(month.totalMinutes)}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={1}>
                {month.days.map((p) => (
                  <Grid item xs={12} key={p.id}>
                    <Paper sx={{ p: 1.5, bgcolor: "#252525", borderRadius: 2 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography sx={{ color: "#fff" }}>{p.id}</Typography>
                        <Chip
                          label={`${statusEmojis[p.status] || "❔"} ${p.status}`}
                          size="small"
                          sx={{
                            bgcolor: "#333",
                            color: "white",
                            fontWeight: "bold",
                          }}
                        />
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
                        {isAdmin && (
                          <IconButton color="error" onClick={() => handleExcluirPonto(p.id)}>
                            <DeleteForeverIcon />
                          </IconButton>
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
    </Container>
  );
}
