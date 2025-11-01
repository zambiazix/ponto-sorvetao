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
  Link,
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
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
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

  const statusList = [
    "OK",
    "FALTA",
    "ATESTADO",
    "FÉRIAS",
    "SUSPENSÃO",
    "DISPENSA",
    "FOLGA",
  ];

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
        await loadFaceApiModels(); // carrega modelos (public/models)
      } catch (err) {
        console.warn(
          "Falha ao carregar modelos face-api (ok se ainda não tiver):",
          err
        );
      }
      await carregarLoja();
      await carregarFuncionario();
      await carregarPontos();
      // chamamos verificarFolgaAutomatica depois dos carregamentos para usar dados atualizados
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
      const funcSnap = await getDoc(
        doc(db, "lojas", lojaId, "funcionarios", funcionarioId)
      );
      if (funcSnap.exists()) setFuncData(funcSnap.data());
    } catch (err) {
      console.error("Erro carregarFuncionario:", err);
    }
  };

  // carregarPontos: força recarregar a lista (usar servidor implicitamente ao pedir novamente)
  const carregarPontos = async () => {
    try {
      setCarregando(true);
      const snap = await getDocs(
        collection(db, "lojas", lojaId, "funcionarios", funcionarioId, "pontos")
      );
      const lista = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => b.id.localeCompare(a.id));
      console.log("📅 Pontos carregados do Firestore:", lista.map((p) => p.id));
      setPontos(lista);
    } catch (err) {
      console.error("Erro carregarPontos:", err);
    } finally {
      setCarregando(false);
    }
  };

  // Usa data local (corrige problemas de fuso).
  // Aqui usamos Intl DateTimeFormat com timeZone explicitamente para garantir YYYY-MM-DD em horário de São Paulo.
  const getHojeId = () => {
    try {
      const hoje = new Intl.DateTimeFormat("en-CA", {
        timeZone: BRAZIL_TZ,
      }).format(new Date()); // en-CA -> YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(hoje)) return hoje;
    } catch (err) {
      console.warn("getHojeId Intl fallback falhou:", err);
    }
    // fallback manual
    const agora = new Date();
    const ano = agora.getFullYear();
    const mes = String(agora.getMonth() + 1).padStart(2, "0");
    const dia = String(agora.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  };

  // Função para obter hora atual formatada no fuso de SP (HH:MM)
  const getHoraAtualLocal = () => {
    try {
      const hora = new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: BRAZIL_TZ,
      }).format(new Date());
      // o resultado vem como "09:05" ou "9:05" dependendo da localidade; força HH:MM
      const parts = hora.split(":").map((s) => s.padStart(2, "0"));
      return `${parts[0]}:${parts[1]}`;
    } catch (err) {
      // fallback simples
      const agora = new Date();
      return agora.toTimeString().split(":").slice(0, 2).join(":");
    }
  };

  const verificarFolgaAutomatica = async () => {
    try {
      // pega hora local de SP para decidir >=16
      const agoraSP = new Date(new Date().toLocaleString("en-US", { timeZone: BRAZIL_TZ }));
      if (agoraSP.getHours() < 16) return;
      const hoje = getHojeId();
      console.log("🔹 verificarFolgaAutomatica -> hoje:", hoje);

      const docRef = doc(
        db,
        "lojas",
        lojaId,
        "funcionarios",
        funcionarioId,
        "pontos",
        hoje
      );

      // tenta buscar do servidor primeiro pra evitar cache antigo
      let snap;
      try {
        snap = await getDoc(docRef, { source: "server" });
      } catch (err) {
        // se não suportar source, cai no getDoc normal
        console.warn("getDoc(source: 'server') falhou, usando getDoc normal:", err);
        snap = await getDoc(docRef);
      }

      if (!snap.exists()) {
        await setDoc(docRef, { data: hoje, status: "FOLGA", criadoEm: serverTimestamp() });
        // recarrega pontos para UI
        await carregarPontos();
        console.log("✅ Folga automática criada para", hoje, "->", `loja:${lojaId} func:${funcionarioId}`);
      } else {
        console.log("⏭️ Já existe documento de ponto para", hoje);
      }
    } catch (err) {
      console.error("Erro verificarFolgaAutomatica:", err);
    }
  };

  // --- Função que grava horário (entrada/intervalo/volta/saida) ---
  const onVerifyPunchSuccess = async () => {
    try {
      const hoje = getHojeId();
      console.log("🕒 onVerifyPunchSuccess -> hoje:", hoje);

      const docRef = doc(
        db,
        "lojas",
        lojaId,
        "funcionarios",
        funcionarioId,
        "pontos",
        hoje
      );

      console.log("🧭 onVerifyPunchSuccess -> docRef path:", docRef.path);

      // tenta ler diretamente do servidor para evitar cache desatualizado
      let snap;
      try {
        snap = await getDoc(docRef, { source: "server" });
      } catch (err) {
        // se a opção não for suportada, cai para getDoc normal
        console.warn("getDoc(source: 'server') falhou, usando getDoc normal:", err);
        snap = await getDoc(docRef);
      }

      const horaAtual = getHoraAtualLocal();

      let dados = snap.exists() ? { ...snap.data() } : { data: hoje, status: "OK" };

      // CONFERÊNCIA: calculamos quantos pontos já existem **nesse documento** (dia atual)
      const pontosHoje = [
        dados.entrada,
        dados.intervaloSaida,
        dados.intervaloVolta,
        dados.saida,
      ].filter(Boolean).length;

      console.log("🔎 pontosHoje:", pontosHoje, "dados:", dados);

      if (pontosHoje >= 4) {
        alert(`⚠️ Todos os pontos do dia já foram marcados (para ${hoje}).`);
        return;
      }

      // preenche próximo espaço disponível
      if (!dados.entrada) dados.entrada = horaAtual;
      else if (!dados.intervaloSaida) dados.intervaloSaida = horaAtual;
      else if (!dados.intervaloVolta) dados.intervaloVolta = horaAtual;
      else if (!dados.saida) dados.saida = horaAtual;

      // salva no Firestore
      await setDoc(docRef, dados, { merge: true });
      console.log("✅ Ponto salvo em:", hoje, dados);

      // pequeno delay pra permitir a propagação (normalmente não é necessário,
      // mas evita mostrar UI desatualizada em alguns casos)
      await new Promise((resolve) => setTimeout(resolve, 700));

      // recarrega a lista de pontos DO SERVIDOR
      await carregarPontos();

      alert("✅ Ponto registrado com sucesso!");
      setMode("view");
    } catch (err) {
      console.error("❌ Erro onVerifyPunchSuccess:", err);
      alert("Erro ao registrar ponto.");
    }
  };

  // Implementação local de verificação facial usando utilitários existentes
  // blob/dataUrl -> cria imagem -> get descriptor -> compara com armazenado em funcData.faceDescriptor
  const verifyLiveAgainstReference = async (blob, dataUrl, onSuccess, onFail) => {
    try {
      const img = await createImageElementFromDataUrl(dataUrl);
      const liveDesc = await getFaceDescriptorFromMedia(img);
      if (!liveDesc) return onFail("Rosto não detectado.");

      const storedArr = funcData?.faceDescriptor || null;
      if (!storedArr) return onFail("Sem foto cadastrada.");

      const storedDesc = arrayToDescriptor(storedArr);
      const { match, distance } = compareDescriptors(storedDesc, liveDesc, THRESHOLD);

      console.debug("compareDescriptors =>", { match, distance });
      if (match) {
        // grava ponto
        await onSuccess();
      } else onFail("Rosto não confere.");
    } catch (err) {
      console.error("Erro verifyLiveAgainstReference:", err);
      onFail("Erro na verificação facial.");
    }
  };

  // Botão principal: admin bate direto, não-admin abre modo verify
  const requestPunchWithFace = async () => {
    if (isAdmin) {
      console.log("🟡 ADMIN ignorando reconhecimento facial — batendo ponto diretamente");
      return onVerifyPunchSuccess();
    }

    if (!funcData?.faceDescriptor) {
      alert("⚠️ Nenhuma foto de referência cadastrada!");
      return;
    }

    setMode("verify-punch");
  };

  // Upload de atestado (separado — não deve acionar lógica de bater ponto)
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
    } catch (err) {
      console.error("Erro handleUploadAtestado:", err);
      alert("Erro ao enviar atestado.");
    } finally {
      setUploadingAtestado(false);
    }
  };

  // --- NOVA FUNÇÃO: excluir ponto por dia (visível somente ao admin) ---
  const handleExcluirPonto = async (dayId) => {
    if (!isAdmin) return alert("Somente o administrador pode excluir pontos.");
    if (!window.confirm("Tem certeza que deseja excluir este dia e todos os dados associados?")) return;
    try {
      await deleteDoc(doc(db, "lojas", lojaId, "funcionarios", funcionarioId, "pontos", dayId));
      await carregarPontos();
      alert("🗑️ Ponto excluído com sucesso!");
    } catch (err) {
      console.error("Erro handleExcluirPonto:", err);
      alert("Erro ao excluir ponto.");
    }
  };
  // --- fim da função de exclusão ---

  // Helpers horas
  const toMinutes = (t) => {
    if (!t) return null;
    const parts = t.split(":").map((x) => Number(x));
    if (
      parts.length < 2 ||
      Number.isNaN(parts[0]) ||
      Number.isNaN(parts[1])
    )
      return null;
    return parts[0] * 60 + parts[1];
  };

  const calcMinutesWorkedForDay = (p) => {
    const e = toMinutes(p.entrada);
    const isOut = toMinutes(p.intervaloSaida);
    const iv = toMinutes(p.intervaloVolta);
    const s = toMinutes(p.saida);

    let total = 0;
    if (e != null && isOut != null && isOut > e) total += Math.max(0, isOut - e);
    if (
      (iv == null || s == null) &&
      e != null &&
      s != null &&
      s > e &&
      (isOut == null || iv == null)
    ) {
      total = Math.max(0, s - e);
    } else {
      if (iv != null && s != null && s > iv) total += Math.max(0, s - iv);
    }
    return total;
  };

  const minutesToHHMM = (mins) => {
    if (mins == null || Number.isNaN(mins)) return "0h 0m";
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return `${h}h ${m}m`;
  };

  // Agrupa por mês
  const groupByMonth = (pontosList) => {
    const map = new Map();
    pontosList.forEach((p) => {
      // IMPORTANT: use 'T00:00:00' so JS interprets date as local midnight (no UTC shift)
      const date = new Date(p.id + "T00:00:00");
      if (isNaN(date)) return;
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);

      if (!map.has(monthKey)) map.set(monthKey, { label: monthLabel, days: [], totalMinutes: 0 });
      const entry = map.get(monthKey);
      entry.days.push(p);
      const mins = calcMinutesWorkedForDay(p);
      entry.totalMinutes += mins || 0;
    });

    const arr = Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, value]) => ({ monthKey: key, ...value }));
    return arr;
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
    <Container sx={{ bgcolor: "#121212", minHeight: "100vh", py: 4, color: "white", position: "relative" }}>
      {/* Marca d’água fixa no topo */}
      <Box sx={{ position: "fixed", top: 8, right: 16, color: "rgba(255,255,255,0.2)", fontSize: 12, zIndex: 9999 }}>
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

        <Box display="flex" alignItems="center" gap={2} sx={{ flexGrow: 1, justifyContent: "center" }}>
          <img src="/logo.jpg" alt="Logo" style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover" }} />
          <Typography variant="h5" sx={{ color: "#fff", fontWeight: "bold" }}>{lojaNome || "Loja"}</Typography>
        </Box>
      </Stack>

      <Paper sx={{ p: 3, bgcolor: "#1e1e1e", borderRadius: 3 }}>
        <Box textAlign="center" mb={3}>
          <Avatar
            src={funcData?.fotoReferencia || ""}
            sx={{ width: 100, height: 100, margin: "0 auto", mb: 1 }}
          />
          <Typography variant="h6" sx={{ color: "#fff" }}>{funcData?.nome}</Typography>
          <Typography variant="body2" sx={{ color: "#bdbdbd", mb: 1 }}>Foto de referência</Typography>

          {isAdmin && (
            <Button variant="contained" color="warning" startIcon={<AddAPhotoIcon />} sx={{ mt: 2 }} onClick={() => setMode("enroll")}>
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
            <Typography mb={1} sx={{ color: "#fff" }}>Posicione o rosto e clique para verificar</Typography>
            <WebcamCapture
              captureLabel="Capturar e Verificar"
              onCapture={async (blob, dataUrl) => {
                await verifyLiveAgainstReference(blob, dataUrl, onVerifyPunchSuccess, (r) => alert(r));
              }}
              facingMode="user"
            />
            <Button startIcon={<CancelIcon />} variant="outlined" color="inherit" sx={{ mt: 2 }} onClick={() => setMode("view")}>Cancelar</Button>
          </Paper>
        )}

        {mode === "view" && (
          <Box textAlign="center" mt={2}>
            <Button variant="contained" color="success" startIcon={<CameraAltIcon />} onClick={requestPunchWithFace} fullWidth>
              Bater Ponto
            </Button>
          </Box>
        )}

        <Divider sx={{ my: 3, bgcolor: "#333" }} />

        <Typography variant="h6" mb={2} sx={{ color: "#fff", display: "flex", alignItems: "center", gap: 1 }}>🕓 Histórico de Pontos</Typography>

        {months.length === 0 ? (
          <Typography color="gray" align="center">Nenhum ponto registrado ainda.</Typography>
        ) : (
          months.map((month) => {
            const isCurrent = month.monthKey === currentMonthKey;
            return (
              <Accordion key={month.monthKey} defaultExpanded={isCurrent} sx={{ bgcolor: "#1c1c1c", color: "white", mb: 2 }}>
                {/* Força cor branca no summary e no conteúdo do summary (evita overlay do MUI escurecer o texto) */}
                <AccordionSummary
                  expandIcon={<ExpandMoreIcon sx={{ color: "white" }} />}
                  sx={{
                    color: "#fff !important",
                    // garante que o conteúdo e tipografia filhos fiquem brancos
                    "& .MuiAccordionSummary-content": { color: "#fff !important" },
                    "& .MuiTypography-root": { color: "#fff !important" },
                  }}
                >
                  <Box display="flex" alignItems="center" justifyContent="space-between" width="100%">
                    <Box display="flex" alignItems="center" gap={2}>
                      <Typography
                        sx={{
                          fontWeight: "bold",
                          textTransform: "capitalize",
                          color: "#fff !important",
                        }}
                      >
                        {month.label}
                      </Typography>
                      {/* Forçar chip de total do mês com texto branco para contraste */}
                      <Chip label={minutesToHHMM(month.totalMinutes)} size="small" sx={{ bgcolor: "#333", color: "#fff" }} />
                    </Box>
                    <Typography variant="body2" color="gray">{month.days.length} dia(s)</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails sx={{ bgcolor: "#222" }}>
                  {month.days.map((p) => (
                    <Paper key={p.id} sx={{ bgcolor: "#2a2a2a", p: 2, mb: 2, borderRadius: 2, overflowX: "auto" }}>
                      <Grid container spacing={1} alignItems="center">
                        <Grid item xs={12} md={2}>
                          {/* use 'T00:00:00' to avoid UTC shift when creating Date for display */}
                          <Typography color="#fff">{new Date(p.id + "T00:00:00").toLocaleDateString("pt-BR")}</Typography>
                          {p.atestadoUrl && (
                            <Box mt={1}>
                              <a href={p.atestadoUrl} target="_blank" rel="noreferrer">
                                <img src={p.atestadoUrl} alt="atestado" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6 }} />
                              </a>
                            </Box>
                          )}
                        </Grid>

                        {["entrada", "intervaloSaida", "intervaloVolta", "saida"].map((campo, idx) => (
                          <Grid item xs={6} md={2} key={campo}>
                            <TextField
                              size="small"
                              fullWidth
                              label={["⏰ Entrada","⏰ Saída Int.","⏰ Volta Int.","⏰ Saída"][idx]}
                              value={p[campo] || ""}
                              onChange={(e) => isAdmin && updateDoc(doc(db, "lojas", lojaId, "funcionarios", funcionarioId, "pontos", p.id), { [campo]: e.target.value }).then(carregarPontos)}
                              disabled={!isAdmin}
                              type="time"
                              InputLabelProps={{ shrink: true, style: { color: "#fff" } }}
                              sx={{ input: { color: "white" }, "& .MuiFormLabel-root": { color: "#fff" } }}
                            />
                          </Grid>
                        ))}

                        <Grid item xs={12} md={2} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                          <TextField
                            select
                            fullWidth
                            size="small"
                            label="Status"
                            value={p.status || "OK"}
                            onChange={(e) => isAdmin && updateDoc(doc(db, "lojas", lojaId, "funcionarios", funcionarioId, "pontos", p.id), { status: e.target.value }).then(carregarPontos)}
                            disabled={!isAdmin}
                            sx={{ "& .MuiSelect-select": { color: "white" }, label: { color: "gray" } }}
                            InputLabelProps={{ style: { color: "#bbb" } }}
                          >
                            {statusList.map((s) => <MenuItem key={s} value={s}>{statusEmojis[s]} {s}</MenuItem>)}
                          </TextField>

                          {p.status === "ATESTADO" && (
                            <Box>
                              <input
                                accept="image/*"
                                style={{ display: "none" }}
                                id={`atestado-input-${p.id}`}
                                type="file"
                                capture="environment"
                                onChange={(ev) => {
                                  const file = ev.target.files?.[0];
                                  if (file) handleUploadAtestado(p.id, file);
                                  ev.target.value = null;
                                }}
                              />
                              <label htmlFor={`atestado-input-${p.id}`}>
                                <IconButton color="primary" component="span" size="small" title="Enviar atestado / tirar foto">
                                  <PhotoCamera />
                                </IconButton>
                              </label>
                            </Box>
                          )}
                        </Grid>
                      </Grid>

                      <Box mt={1} display="flex" justifyContent="flex-end" alignItems="center" gap={1}>
                        <Typography variant="body2" sx={{ color: "#ccc" }}>Total do dia:</Typography>
                        <Chip label={minutesToHHMM(calcMinutesWorkedForDay(p))} sx={{ bgcolor: "#333", color: "#fff" }} />
                        {p.atestadoUrl && <Typography variant="body2" color="inherit" sx={{ ml: 1 }}>📎 Atestado enviado</Typography>}
                        {/* Botão excluir mostrado somente ao admin */}
                        {isAdmin && (
                          <IconButton color="error" size="small" onClick={() => handleExcluirPonto(p.id)} title="Excluir dia">
                            <DeleteForeverIcon />
                          </IconButton>
                        )}
                      </Box>
                    </Paper>
                  ))}
                </AccordionDetails>
              </Accordion>
            );
          })
        )}
      </Paper>

      <Box textAlign="center" mt={4}>
        <Button variant="contained" color="error" startIcon={<ExitToAppIcon />} onClick={() => navigate("/")}>Sair</Button>
      </Box>
    </Container>
  );
}
