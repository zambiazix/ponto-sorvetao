import { useEffect, useState } from "react";
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
} from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import AddIcon from "@mui/icons-material/Add";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import PersonIcon from "@mui/icons-material/Person";
import * as faceapi from "@vladmandic/face-api";

const ADMIN_UID = "mD3ie8YGmgaup2VVDpKuMBltXgp2";

export default function Painel() {
  const navigate = useNavigate();
  const { lojaId } = useParams();
  const [funcionarios, setFuncionarios] = useState([]);
  const [novoNome, setNovoNome] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [nomeLoja, setNomeLoja] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsAdmin(!!user && user.uid === ADMIN_UID);
    });
    return () => unsub();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/");
  };

  const carregarFuncionarios = async () => {
    try {
      const q = query(collection(db, "lojas", lojaId, "funcionarios"));
      const snap = await getDocs(q);
      const lista = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setFuncionarios(lista);
    } catch (err) {
      console.error("Erro ao carregar funcionários:", err);
    } finally {
      setCarregando(false);
    }
  };

  const carregarNomeLoja = async () => {
    try {
      const lojaSnap = await getDoc(doc(db, "lojas", lojaId));
      if (lojaSnap.exists()) {
        setNomeLoja(lojaSnap.data().nome);
      } else {
        setNomeLoja(lojaId);
      }
    } catch (err) {
      console.error("Erro ao buscar nome da loja:", err);
    }
  };

  useEffect(() => {
    carregarFuncionarios();
    carregarNomeLoja();
  }, [lojaId]);

  const adicionarFuncionario = async (e) => {
    e.preventDefault();
    if (!novoNome.trim()) return;
    await addDoc(collection(db, "lojas", lojaId, "funcionarios"), {
      nome: novoNome,
    });
    setNovoNome("");
    carregarFuncionarios();
  };

  // 🧠 Reconhecimento facial no botão "Ver Perfil"
  // 🧠 Função de reconhecimento facial no botão "Ver Perfil"
const handleReconhecimentoFacial = async (funcId, nomeFuncionario) => {
  const user = auth.currentUser;
  if (user && user.uid === ADMIN_UID) {
    navigate(`/admin/loja/${lojaId}/funcionario/${funcId}`);
    return;
  }

  try {
    const funcRef = doc(db, "lojas", lojaId, "funcionarios", funcId);
    const funcSnap = await getDoc(funcRef);
    if (!funcSnap.exists()) {
      alert("Funcionário não encontrado.");
      return;
    }

    const funcData = funcSnap.data();

    if (!funcData.fotoReferencia) {
      alert("⚠️ Este funcionário ainda não possui imagem cadastrada para reconhecimento facial.");
      return;
    }

    // 🧠 Carrega todos os modelos necessários
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri("/models"),
      faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
      faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
    ]);

    const referenceImage = await faceapi.fetchImage(funcData.fotoReferencia);
    const labeledDescriptor = await faceapi
      .detectSingleFace(referenceImage)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!labeledDescriptor) {
      alert("❌ Não foi possível processar a imagem de referência.");
      return;
    }

    const faceMatcher = new faceapi.FaceMatcher(
      new faceapi.LabeledFaceDescriptors(nomeFuncionario, [
        labeledDescriptor.descriptor,
      ])
    );

    // 🎥 Cria vídeo temporário
    const video = document.createElement("video");
    video.autoplay = true;
    video.style.position = "fixed";
    video.style.top = "50%";
    video.style.left = "50%";
    video.style.transform = "translate(-50%, -50%)";
    video.style.zIndex = 9999;
    video.style.border = "2px solid #fff";
    video.style.borderRadius = "10px";
    video.width = 400;
    video.height = 300;
    document.body.appendChild(video);

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;

    alert("📸 Olhe para a câmera por alguns segundos para verificação...");

    await new Promise((res) => setTimeout(res, 4000));

    const detection = await faceapi
      .detectSingleFace(video, new faceapi.SsdMobilenetv1Options())
      .withFaceLandmarks()
      .withFaceDescriptor();

    stream.getTracks().forEach((t) => t.stop());
    video.remove();

    if (!detection) {
      alert("❌ Nenhum rosto detectado. Tente novamente.");
      return;
    }

    const bestMatch = faceMatcher.findBestMatch(detection.descriptor);

    if (bestMatch.label === nomeFuncionario && bestMatch.distance < 0.5) {
      alert("✅ Rosto reconhecido com sucesso!");
      navigate(`/admin/loja/${lojaId}/funcionario/${funcId}`);
    } else {
      alert("⚠️ Rosto não reconhecido. Acesso negado.");
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
    <Container
      sx={{
        bgcolor: "#121212",
        minHeight: "100vh",
        py: 4,
        color: "white",
      }}
    >
      {/* Cabeçalho com logo e nome da loja */}
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

      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        mb={3}
        gap={1.5}
      >
        <img
          src="/logo.jpg"
          alt="Logo da Loja"
          style={{
            width: 50,
            height: 50,
            borderRadius: "50%",
            objectFit: "cover",
            boxShadow: "0 0 10px rgba(0,0,0,0.5)",
          }}
        />
        <Typography variant="h5" textAlign="center">
          Funcionários — {nomeLoja || "Carregando..."}
        </Typography>
      </Box>

      {/* Formulário adicionar funcionário */}
      <Paper
        sx={{
          p: 3,
          mb: 4,
          bgcolor: "#1e1e1e",
          color: "white",
          borderRadius: 3,
        }}
      >
        <Box
          component="form"
          onSubmit={adicionarFuncionario}
          display="flex"
          gap={2}
        >
          <TextField
            label="Nome do funcionário"
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            fullWidth
            variant="filled"
            InputProps={{
              style: { backgroundColor: "#2a2a2a", color: "white" },
            }}
            InputLabelProps={{ style: { color: "#bbb" } }}
          />
          <Button
            variant="contained"
            color="primary"
            type="submit"
            startIcon={<AddIcon />}
          >
            Adicionar
          </Button>
        </Box>
      </Paper>

      {/* Lista de funcionários */}
      <Paper
        sx={{
          p: 2,
          bgcolor: "#1e1e1e",
          color: "white",
          borderRadius: 3,
        }}
      >
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
                    <Button
                      variant="contained"
                      color="success"
                      size="small"
                      onClick={() =>
                        handleReconhecimentoFacial(func.id, func.nome)
                      }
                      startIcon={<PersonIcon />}
                    >
                      Ver Perfil
                    </Button>
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

      {/* Botões inferiores */}
      <Stack direction="row" spacing={2} justifyContent="center" mt={4}>
        {isAdmin && (
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<ArrowBackIcon />}
            onClick={() => navigate("/admin")}
          >
            Painel Admin
          </Button>
        )}
        <Button
          variant="contained"
          color="error"
          startIcon={<LogoutIcon />}
          onClick={handleLogout}
        >
          Sair
        </Button>
      </Stack>
    </Container>
  );
}
