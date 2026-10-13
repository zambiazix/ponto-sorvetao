// src/pages/Painel.jsx
import { useEffect, useState, useRef } from "react";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../services/firebase";
import { useNavigate, useParams } from "react-router-dom";
import {
  collection,
  addDoc,
  getDocs,
  query,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  List,
  ListItem,
  ListItemText,
  Divider,
  Stack,
  Box,
  IconButton,
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PersonIcon from "@mui/icons-material/Person";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import * as faceapi from "@vladmandic/face-api";
import ConsentDialogs from "../components/ConsentDialogs";
import PontoRapido from "../components/PontoRapido";
import { useFaceApi } from "../contexts/FaceApiContext";
import FaceRetouchingNaturalIcon from "@mui/icons-material/FaceRetouchingNatural";
import Inventory2Icon from "@mui/icons-material/Inventory2";

const ADMIN_UID = "mD3ie8YGmgaup2VVDpKuMBltXgp2";
const BRAZIL_TZ = "America/Sao_Paulo";

export default function Painel() {
  const navigate = useNavigate();
  const { lojaId: lojaParam } = useParams();
  const [funcionarios, setFuncionarios] = useState([]);
  const [novoNome, setNovoNome] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isGerente, setIsGerente] = useState(false);
  const [nomeLoja, setNomeLoja] = useState("");
  const [lojaId, setLojaId] = useState(lojaParam || "");
  const [modelosCarregados, setModelosCarregados] = useState(false);

  // LGPD
  const [currentUser, setCurrentUser] = useState(null);
  const [consentDialogOpen, setConsentDialogOpen] = useState(false);
  const [consentPendingFuncId, setConsentPendingFuncId] = useState(null);
  const [consentPendingNome, setConsentPendingNome] = useState(null);
  const [reconhecimentoEmAndamento, setReconhecimentoEmAndamento] = useState(false);
  const [pontoRapidoOpen, setPontoRapidoOpen] = useState(false);
  const [botaoBloqueado, setBotaoBloqueado] = useState(false);

  const DOCUMENT_VERSION = "1.0";

  // --- Helper: retorna YYYY-MM-DD no timezone do Brasil
  const getHojeId = () => {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: BRAZIL_TZ }).format(new Date());
    } catch {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  };

  // --- Função que aplica folga automática somente para o DIA ATUAL (global)
  const verificarFolgaGlobalDiaAtual = async () => {
    try {
      const agoraSP = new Date(new Date().toLocaleString("en-US", { timeZone: BRAZIL_TZ }));
      if (agoraSP.getHours() < 16) {
        console.log("verificarFolgaGlobalDiaAtual: antes das 16:00, pulando.");
        return;
      }

      const hoje = getHojeId();
      console.log("verificarFolgaGlobalDiaAtual: iniciando varredura para:", hoje);

      const lojasSnap = await getDocs(collection(db, "lojas"));
      for (const lojaDoc of lojasSnap.docs) {
        const lojaIdLocal = lojaDoc.id;
        const funcionariosSnap = await getDocs(collection(db, "lojas", lojaIdLocal, "funcionarios"));
        for (const funcDoc of funcionariosSnap.docs) {
          const funcId = funcDoc.id;
          const pontoRef = doc(db, "lojas", lojaIdLocal, "funcionarios", funcId, "pontos", hoje);
          const pontoSnap = await getDoc(pontoRef);
          const dados = pontoSnap.exists() ? pontoSnap.data() : null;

          const nenhumPontoBatido =
            !dados ||
            (!dados.entrada && !dados.intervaloSaida && !dados.intervaloVolta && !dados.saida);

          if (nenhumPontoBatido) {
            await setDoc(
              pontoRef,
              {
                data: hoje,
                status: "FOLGA",
                criadoAutomaticamente: true,
                criadoEm: serverTimestamp(),
              },
              { merge: true }
            );
            console.log(`Folga aplicada: loja=${lojaIdLocal} func=${funcId}`);
          } else {
            console.log(`Ignorado (tem ponto/status): loja=${lojaIdLocal} func=${funcId}`);
          }
        }
      }

      console.log("verificarFolgaGlobalDiaAtual: varredura concluída.");
    } catch (err) {
      console.error("Erro em verificarFolgaGlobalDiaAtual:", err);
    }
  };

 // ✅ Usa modelos e câmera do contexto global (já carregados)
const { modelsLoaded, getCameraStream } = useFaceApi();
useEffect(() => {
  if (modelsLoaded) {
    setModelosCarregados(true);
    console.log("✅ Modelos disponíveis via contexto");
  }
}, [modelsLoaded]);
  // 👤 Verifica usuário logado
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user || null);
      if (user) {
        if (user.uid === ADMIN_UID) {
          setIsAdmin(true);
          setLojaId(lojaParam);
          setCarregando(false);
          return;
        }

        const gerenteRef = doc(db, "gerentes", user.uid);
        const gerenteSnap = await getDoc(gerenteRef);
        if (gerenteSnap.exists()) {
          const lojaGerente = gerenteSnap.data().lojaId;
          if (lojaGerente) {
            console.log("✅ Gerente vinculado à loja:", lojaGerente);
            setIsGerente(true);
            setLojaId(lojaGerente);
            setCarregando(false);
            return;
          }
        }
        setCarregando(false);
      } else {
        navigate("/");
      }
    });
    return () => unsub();
  }, [navigate, lojaParam]);

  // IMPORTANTE: roda a varredura global ao abrir o Painel
  useEffect(() => {
    (async () => {
      try {
        await verificarFolgaGlobalDiaAtual();
      } catch (err) {
        console.error("Erro ao rodar verificarFolgaGlobalDiaAtual no Painel:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // roda apenas uma vez na montagem

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/");
  };

  // 📦 Carregar funcionários
  const carregarFuncionarios = async (idLoja) => {
    try {
      const q = query(collection(db, "lojas", idLoja, "funcionarios"));
      const snap = await getDocs(q);
      const lista = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setFuncionarios(lista);
    } catch (err) {
      console.error("Erro ao carregar funcionários:", err);
    } finally {
      setCarregando(false);
    }
  };

  const carregarNomeLoja = async (idLoja) => {
    try {
      const lojaSnap = await getDoc(doc(db, "lojas", idLoja));
      if (lojaSnap.exists()) setNomeLoja(lojaSnap.data().nome);
      else setNomeLoja(idLoja);
    } catch (err) {
      console.error("Erro ao buscar nome da loja:", err);
    }
  };

  useEffect(() => {
    if (lojaId) {
      carregarFuncionarios(lojaId);
      carregarNomeLoja(lojaId);
    }
  }, [lojaId]);

  const adicionarFuncionario = async (e) => {
    e.preventDefault();
    if (!novoNome.trim() || !lojaId) return;
    await addDoc(collection(db, "lojas", lojaId, "funcionarios"), { nome: novoNome });
    setNovoNome("");
    carregarFuncionarios(lojaId);
  };

  const editarFuncionario = async (func) => {
    if (!isAdmin && !isGerente) return alert("Somente admin ou gerente podem editar.");
    const novoNome = prompt("Digite o novo nome do funcionário:", func.nome);
    if (!novoNome || novoNome.trim() === "") return;
    try {
      const funcRef = doc(db, "lojas", lojaId, "funcionarios", func.id);
      await updateDoc(funcRef, { nome: novoNome });
      alert("✅ Funcionário atualizado com sucesso!");
      carregarFuncionarios(lojaId);
    } catch (err) {
      console.error("Erro ao editar funcionário:", err);
      alert("Erro ao editar funcionário.");
    }
  };

  const excluirFuncionario = async (func) => {
    if (!isAdmin && !isGerente) return alert("Somente admin ou gerente podem excluir.");
    const confirmar = window.confirm(`Tem certeza que deseja excluir ${func.nome}?`);
    if (!confirmar) return;
    try {
      const funcRef = doc(db, "lojas", lojaId, "funcionarios", func.id);
      await deleteDoc(funcRef);
      alert("🗑️ Funcionário removido com sucesso!");
      carregarFuncionarios(lojaId);
    } catch (err) {
      console.error("Erro ao excluir funcionário:", err);
      alert("Erro ao excluir funcionário.");
    }
  };
// ===============================
// RECONHECIMENTO FACIAL ORIGINAL
// ===============================
const checkConsentForUser = async (funcId) => {
  try {
    const funcRef = doc(db, "lojas", lojaId, "funcionarios", funcId);
    const snap = await getDoc(funcRef);
    if (!snap.exists()) return { ok: false };
    const data = snap.data();
    const ok = !!data.consentimentoFacial && !!data.politicaPrivacidadeAceita;
    return { ok, data };
  } catch (err) {
    console.error("Erro checkConsentForUser:", err);
    return { ok: false };
  }
};

const handleReconhecimentoFacial = async (funcId, nomeFuncionario) => {
  if (reconhecimentoEmAndamento || botaoBloqueado) return; 
  setReconhecimentoEmAndamento(true);
  setBotaoBloqueado(true);

  try {
    const user = currentUser || auth.currentUser;
    if (!user || !lojaId) return;

    if (user.uid === ADMIN_UID || isGerente) {
      navigate(`/admin/loja/${lojaId}/funcionario/${funcId}`);
      return;
    }

    if (user.uid === funcId) {
      const consent = await checkConsentForUser(funcId);
      if (!consent.ok) {
        console.log("📋 Exibindo termos de consentimento...");
        setConsentPendingFuncId(funcId);
        setConsentPendingNome(nomeFuncionario);
        setConsentDialogOpen(true);
        return;
      }
    }

    await proceedWithFacialRecognition(funcId, nomeFuncionario);
  } finally {
    setReconhecimentoEmAndamento(false);
    setTimeout(() => setBotaoBloqueado(false), 1500);
  }
};

const proceedWithFacialRecognition = async (funcId, nomeFuncionario) => {
  if (!modelosCarregados) {
    alert("⚙️ Aguarde o carregamento dos modelos...");
    return;
  }

  try {
    const funcRef = doc(db, "lojas", lojaId, "funcionarios", funcId);
    const funcSnap = await getDoc(funcRef);
    if (!funcSnap.exists()) return alert("Funcionário não encontrado.");
    const funcData = funcSnap.data();

    if (!funcData.fotoReferencia) return alert("Funcionário sem imagem cadastrada.");

    const referenceImage = await faceapi.fetchImage(funcData.fotoReferencia);
    const labeledDescriptor = await faceapi
      .detectSingleFace(referenceImage)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!labeledDescriptor) return alert("Erro ao processar imagem de referência.");

    const faceMatcher = new faceapi.FaceMatcher(
      new faceapi.LabeledFaceDescriptors(nomeFuncionario, [labeledDescriptor.descriptor])
    );

    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.position = "fixed";
    video.style.top = "50%";
    video.style.left = "50%";
    video.style.transform = "translate(-50%, -50%)";
    video.style.zIndex = 9999;
    video.style.border = "2px solid #fff";
    video.style.borderRadius = "10px";
    video.style.objectFit = "cover";
    video.width = 480;
    video.height = 360;
    document.body.appendChild(video);

    // 🔥 Usa stream PRÉ-AQUECIDO do contexto
    const stream = await getCameraStream();
    video.srcObject = stream;

    // Aguarda a câmera estar pronta (sem alert bloqueante)
    await new Promise((resolve) => {
      if (video.readyState >= 2) return resolve();
      video.onloadeddata = resolve;
      setTimeout(resolve, 2000);
    });

    // Pequeno delay para a imagem estabilizar
    await new Promise((res) => setTimeout(res, 1500));

    const detection = await faceapi
      .detectSingleFace(
        video,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })
      )
      .withFaceLandmarks()
      .withFaceDescriptor();

    // 🔥 NÃO para o stream — mantém pré-aquecido no contexto
    video.remove();

    if (!detection) return alert("❌ Nenhum rosto detectado.");

    const bestMatch = faceMatcher.findBestMatch(detection.descriptor);
    if (bestMatch.label === nomeFuncionario && bestMatch.distance < 0.5) {
      alert("✅ Rosto reconhecido com sucesso!");
      navigate(`/admin/loja/${lojaId}/funcionario/${funcId}`);
    } else {
      alert("⚠️ Rosto não reconhecido.");
    }
  } catch (err) {
    console.error("Erro no reconhecimento facial:", err);
    alert("Erro durante o reconhecimento facial.");
  }
};

  if (carregando) {
    return (
      <Container sx={{ bgcolor: "#121212", minHeight: "100vh", color: "white" }}>
        <Typography align="center" mt={10}>
          Carregando...
        </Typography>
      </Container>
    );
  }

  return (
    <Container sx={{ bgcolor: "#121212", minHeight: "100vh", py: 4, color: "white" }}>
      <ConsentDialogs
        open={consentDialogOpen}
        lojaId={lojaId}
        funcionarioId={consentPendingFuncId}
        isAdmin={isAdmin}
        isGerente={isGerente}
        onAccepted={async () => {
          await setDoc(
            doc(db, "lojas", lojaId, "funcionarios", consentPendingFuncId),
            {
              consentimentoFacial: true,
              consentimentoAssinadoEm: new Date().toISOString(),
              politicaPrivacidadeAceita: true,
              politicaAssinadaEm: new Date().toISOString(),
              versaoDocumento: DOCUMENT_VERSION,
            },
            { merge: true }
          );
          setConsentDialogOpen(false);
          // proceedWithFacialRecognition logic deveria vir aqui
        }}
        onClose={() => {
          setConsentDialogOpen(false);
          setConsentPendingFuncId(null);
          setConsentPendingNome(null);
        }}
      />

      <Box
        sx={{
          position: "fixed",
          top: 8,
          right: 16,
          color: "rgba(255,255,255,0.2)",
          fontSize: 12,
          zIndex: 9999,
        }}
      >
        Versão 1.0 - Criado por Zambiazi
      </Box>

      <Box display="flex" alignItems="center" justifyContent="center" mb={3} gap={1.5}>
        <img src="/logo.jpg" alt="Logo da Loja" style={{ width: 50, height: 50, borderRadius: "50%", objectFit: "cover", boxShadow: "0 0 10px rgba(0,0,0,0.5)" }} />
        <Typography variant="h5" textAlign="center">
          Funcionários — {nomeLoja || "Carregando..."}
        </Typography>
      </Box>

      {(isAdmin || isGerente) && (
        <Paper sx={{ p: 3, mb: 4, bgcolor: "#1e1e1e", color: "white", borderRadius: 3 }}>
          <Box component="form" onSubmit={adicionarFuncionario} display="flex" gap={2}>
            <TextField
              label="Nome do funcionário"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              fullWidth
              variant="filled"
              InputProps={{ style: { backgroundColor: "#2a2a2a", color: "white" } }}
              InputLabelProps={{ style: { color: "#bbb" } }}
            />
            <Button variant="contained" color="primary" type="submit" startIcon={<AddIcon />}>
              Adicionar
            </Button>
          </Box>
        </Paper>
      )}
      {/* 🕐 BATER PONTO + 📦 ESTOQUE */}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
        <Button
          variant="contained"
          color="success"
          size="large"
          fullWidth
          startIcon={<FaceRetouchingNaturalIcon />}
          onClick={() => setPontoRapidoOpen(true)}
          sx={{ py: 1.5, fontSize: "1.1rem" }}
        >
          🕐 Bater Ponto Rápido
        </Button>
        <Button
          variant="contained"
          color="primary"
          size="large"
          fullWidth
          startIcon={<Inventory2Icon />}
          onClick={() => navigate(`/loja/${lojaId}/estoque`)}
          sx={{ py: 1.5, fontSize: "1.1rem" }}
        >
          📦 Estoque
        </Button>
      </Stack>

      <PontoRapido
        open={pontoRapidoOpen}
        onClose={() => {
          setPontoRapidoOpen(false);
          carregarFuncionarios(lojaId); // recarrega após ponto
        }}
        lojaId={lojaId}
        funcionarios={funcionarios}
      />
      <Paper sx={{ p: 2, bgcolor: "#1e1e1e", color: "white", borderRadius: 3 }}>
        {funcionarios.length === 0 ? (
          <Typography color="gray" align="center">
            Nenhum funcionário cadastrado.
          </Typography>
        ) : (
          <List>
            {funcionarios.map((func) => (
              <Box key={func.id}>
                <ListItem
                  secondaryAction={
                    <Box display="flex" gap={1}>
                      <Button
                        variant="contained"
                        color="success"
                        size="small"
                        onClick={() => handleReconhecimentoFacial(func.id, func.nome)}
                        startIcon={<PersonIcon />}
                        disabled={reconhecimentoEmAndamento || botaoBloqueado}
                      >
                        {botaoBloqueado ? "Aguarde..." : "Ver Perfil"}
                      </Button>
                      {(isAdmin || isGerente) && (
                        <>
                          <IconButton color="warning" onClick={() => editarFuncionario(func)}>
                            <EditIcon />
                          </IconButton>
                          <IconButton color="error" onClick={() => excluirFuncionario(func)}>
                            <DeleteIcon />
                          </IconButton>
                        </>
                      )}
                    </Box>
                  }
                >
                  <ListItemText primary={func.nome} />
                </ListItem>
                <Divider sx={{ bgcolor: "#333" }} />
              </Box>
            ))}
          </List>
        )}
      </Paper>

      <Stack direction="row" spacing={2} justifyContent="center" mt={4}>
        {(isAdmin || isGerente) && (
          <Button variant="contained" color="secondary" startIcon={<CalendarMonthIcon />} onClick={() => navigate("/escala-folgas", { state: { funcionarios } })}>
            Escala de Folgas
          </Button>
        )}
        {isAdmin && (
          <Button variant="outlined" color="secondary" startIcon={<ArrowBackIcon />} onClick={() => navigate("/admin")}>
            Painel Admin
          </Button>
        )}
        <Button variant="contained" color="error" startIcon={<LogoutIcon />} onClick={handleLogout}>
          Sair
        </Button>
      </Stack>
    </Container>
  );
}
