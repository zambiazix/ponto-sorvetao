// src/pages/Login.jsx
import { useState, useEffect } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "../services/firebase";
import { useNavigate } from "react-router-dom";
import {
  Container,
  Paper,
  TextField,
  Button,
  Checkbox,
  FormControlLabel,
  Typography,
  CircularProgress,
  IconButton,
  InputAdornment,
  Box,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { doc, getDoc, collection, getDocs, setDoc, serverTimestamp } from "firebase/firestore";

const BRAZIL_TZ = "America/Sao_Paulo";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [lembrar, setLembrar] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem("userEmail");
    const savedSenha = localStorage.getItem("userSenha");
    if (savedEmail && savedSenha) {
      setEmail(savedEmail);
      setSenha(savedSenha);
      setLembrar(true);
    }
  }, []);

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
      console.log("verificarFolgaGlobalDiaAtual: executando varredura para:", hoje);

      const lojasSnap = await getDocs(collection(db, "lojas"));
      for (const lojaDoc of lojasSnap.docs) {
        const lojaId = lojaDoc.id;
        const funcionariosSnap = await getDocs(collection(db, "lojas", lojaId, "funcionarios"));
        for (const funcDoc of funcionariosSnap.docs) {
          const funcId = funcDoc.id;
          const pontoRef = doc(db, "lojas", lojaId, "funcionarios", funcId, "pontos", hoje);
          const pontoSnap = await getDoc(pontoRef);
          const dados = pontoSnap.exists() ? pontoSnap.data() : null;

          const nenhumPontoBatido =
            !dados ||
            (!dados.entrada && !dados.intervaloSaida && !dados.intervaloVolta && !dados.saida);

          // Se não houve nenhum ponto e não existe status diferente, marca folga
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
            console.log(`Folga aplicada: loja=${lojaId} func=${funcId}`);
          } else {
            // Já há algo (ou status) — não substituir
            console.log(`Ignorado (tem ponto/status): loja=${lojaId} func=${funcId}`);
          }
        }
      }

      console.log("verificarFolgaGlobalDiaAtual: varredura concluída.");
    } catch (err) {
      console.error("Erro em verificarFolgaGlobalDiaAtual:", err);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setErro("");
    setCarregando(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, senha);
      const user = userCredential.user;

      // salvar credenciais (opcional)
      if (lembrar) {
        localStorage.setItem("userEmail", email);
        localStorage.setItem("userSenha", senha);
      } else {
        localStorage.removeItem("userEmail");
        localStorage.removeItem("userSenha");
      }

      // Antes de redirecionar, rodar varredura global (se for >= 16:00)
      await verificarFolgaGlobalDiaAtual();

      // redirecionamento (mesma lógica que você tinha)
      if (user.email === "admin@sorvetaoitaliano.com") {
        navigate("/admin");
        return;
      }

      const gerenteRef = doc(db, "gerentes", user.uid);
      const gerenteSnap = await getDoc(gerenteRef);
      if (gerenteSnap.exists()) {
        const lojaId = gerenteSnap.data().lojaId;
        if (lojaId) {
          navigate(`/loja/${lojaId}/painel`);
          return;
        } else {
          setErro("Este gerente não possui loja vinculada.");
          return;
        }
      }

      const lojaRef = doc(db, "lojas", email.trim().toLowerCase());
      const lojaSnap = await getDoc(lojaRef);

      if (lojaSnap.exists()) {
        navigate(`/loja/${lojaSnap.id}/painel`);
      } else {
        setErro("Loja não encontrada no sistema.");
      }
    } catch (error) {
      console.error("Erro ao logar:", error);
      setErro("E-mail ou senha inválidos.");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Container
      maxWidth="xs"
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        bgcolor: "#121212",
        color: "white",
      }}
    >
      <Paper
        sx={{
          p: 4,
          borderRadius: 3,
          bgcolor: "#1e1e1e",
          width: "100%",
          textAlign: "center",
        }}
      >
        <Box mb={3}>
          <img
            src="/logo.jpg"
            alt="Logo"
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              border: "1px solid #333",
              backgroundColor: "white",
              objectFit: "cover",
            }}
          />
        </Box>

        <Typography variant="h5" mb={2} sx={{ fontWeight: "bold", color: "white" }}>
          Acesso ao Sistema
        </Typography>

        {erro && (
          <Typography color="error" variant="body2" mb={2}>
            {erro}
          </Typography>
        )}

        <Box component="form" onSubmit={handleLogin}>
          <TextField
            label="E-mail"
            fullWidth
            variant="outlined"
            margin="normal"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            InputProps={{ style: { color: "white" } }}
            InputLabelProps={{ style: { color: "#bbb" } }}
          />
          <TextField
            label="Senha"
            fullWidth
            variant="outlined"
            margin="normal"
            type={mostrarSenha ? "text" : "password"}
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            InputProps={{
              style: { color: "white" },
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setMostrarSenha(!mostrarSenha)} edge="end" sx={{ color: "#bbb" }}>
                    {mostrarSenha ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
            InputLabelProps={{ style: { color: "#bbb" } }}
          />

          <FormControlLabel
            control={<Checkbox checked={lembrar} onChange={(e) => setLembrar(e.target.checked)} sx={{ color: "#2196f3" }} />}
            label="Conectar automaticamente"
            sx={{ color: "#bbb", mb: 2 }}
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            disabled={carregando}
            sx={{
              bgcolor: "#1976d2",
              "&:hover": { bgcolor: "#1565c0" },
              mt: 1,
              py: 1.2,
              fontWeight: "bold",
            }}
          >
            {carregando ? (
              <>
                <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
                Entrando...
              </>
            ) : (
              "Entrar"
            )}
          </Button>
        </Box>
      </Paper>
    </Container>
  );
}
