// src/pages/AdminPainel.jsx
import { useEffect, useState } from "react";
import { auth, db, secondaryAuth } from "../services/firebase";
import {
  collection,
  getDocs,
  query,
  deleteDoc,
  doc,
  setDoc,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { signOut as signOutMain } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  signOut as signOutSecondary,
} from "firebase/auth";

// MUI
import {
  Container,
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Stack,
  InputAdornment,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import StoreIcon from "@mui/icons-material/Store";
import LogoutIcon from "@mui/icons-material/Logout";
import { Visibility, VisibilityOff } from "@mui/icons-material";

export default function AdminPainel() {
  const [lojas, setLojas] = useState([]);
  const [nomeLoja, setNomeLoja] = useState("");
  const [emailLoja, setEmailLoja] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    carregarLojas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const carregarLojas = async () => {
    try {
      const q = query(collection(db, "lojas"));
      const snap = await getDocs(q);
      const lista = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setLojas(lista);
    } catch (err) {
      console.error("Erro ao carregar lojas:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await signOutMain(auth);
      navigate("/");
    } catch (err) {
      console.error("Erro ao deslogar:", err);
    }
  };

  const criarLoja = async (e) => {
    e.preventDefault();
    if (!nomeLoja || !emailLoja || !senha) return;
    setCarregando(true);

    try {
      const nomeFormatado =
        nomeLoja.trim().charAt(0).toUpperCase() + nomeLoja.trim().slice(1);
      const emailFormatado = emailLoja.trim().toLowerCase();

      const userCred = await createUserWithEmailAndPassword(
        secondaryAuth,
        emailFormatado,
        senha
      );

      try {
        await signOutSecondary(secondaryAuth);
      } catch (errSignOut) {
        console.warn("Não foi possível deslogar secondaryAuth:", errSignOut);
      }

      const lojaRef = doc(db, "lojas", emailFormatado);
      await setDoc(lojaRef, {
        nome: nomeFormatado,
        email: emailFormatado,
        uid: userCred.user.uid,
        criadoEm: new Date(),
      });

      setNomeLoja("");
      setEmailLoja("");
      setSenha("");
      await carregarLojas();

      alert("✅ Loja criada com sucesso!");
    } catch (err) {
      console.error("Erro ao criar loja:", err);
      const code = err?.code || "";
      if (code === "auth/email-already-in-use") {
        alert("⚠️ Este e-mail já está em uso.");
      } else if (code === "auth/invalid-email") {
        alert("⚠️ E-mail inválido.");
      } else if (code === "auth/weak-password") {
        alert("⚠️ Senha fraca. Use 6+ caracteres.");
      } else {
        alert("Erro ao criar loja. Veja o console para detalhes.");
      }
    } finally {
      setCarregando(false);
    }
  };

const excluirLoja = async (email) => {
  if (!window.confirm("⚠️ Deseja excluir esta loja? Esta ação")) return;

  try {
    const resp = await fetch(`${import.meta.env.VITE_API_URL}/deletar-loja`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await resp.json();

    if (!resp.ok) throw new Error(data.error || "Falha ao excluir loja.");

    alert("✅ Loja e usuário removidos com sucesso!");
    await carregarLojas();
  } catch (err) {
    console.error("Erro ao excluir loja:", err);
    alert("❌ Erro ao excluir loja. Veja o console.");
  }
};

  return (
    <Box
      sx={{
        minHeight: "100vh",
        bgcolor: "#0d0d0d",
        color: "white",
        py: 4,
      }}
    >
      <Container maxWidth="md">
        {/* Cabeçalho */}
        <Box sx={{ position: "fixed", top: 8, right: 16, color: "rgba(255,255,255,0.2)", fontSize: 12, zIndex: 9999 }}>
        Versão 1.0 - Criado por Zambiazi
      </Box>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={4}>
          <Box display="flex" alignItems="center" gap={2}>
            <img
              src="/logo.jpg"
              alt="Logo da loja"
              style={{
                width: 50,
                height: 50,
                borderRadius: "50%",
                objectFit: "cover",
                boxShadow: "0 0 10px rgba(0, 0, 0, 0.5)",
              }}
            />
            <Typography variant="h5" fontWeight="bold">
              Painel de Lojas - Sorvetão Italiano
            </Typography>
          </Box>

          <Button
            onClick={handleLogout}
            color="error"
            variant="contained"
            startIcon={<LogoutIcon />}
          >
            Sair
          </Button>
        </Box>

        {/* Criar loja */}
        <Paper sx={{ p: 3, mb: 4, bgcolor: "#1e1e1e", color: "white" }}>
          <Typography
            variant="h6"
            mb={2}
            display="flex"
            alignItems="center"
            gap={1}
          >
            <AddIcon /> Criar nova Loja
          </Typography>

          <Box
            component="form"
            onSubmit={criarLoja}
            display="flex"
            flexDirection="column"
            gap={2}
          >
            <TextField
              label="Nome da Loja"
              value={nomeLoja}
              onChange={(e) => setNomeLoja(e.target.value)}
              fullWidth
              variant="filled"
              InputProps={{
                style: { backgroundColor: "#2a2a2a", color: "white" },
              }}
              InputLabelProps={{ style: { color: "#aaa" } }}
            />
            <TextField
              label="E-mail da Loja"
              type="email"
              value={emailLoja}
              onChange={(e) => setEmailLoja(e.target.value)}
              fullWidth
              variant="filled"
              InputProps={{
                style: { backgroundColor: "#2a2a2a", color: "white" },
              }}
              InputLabelProps={{ style: { color: "#aaa" } }}
            />
            <TextField
              label="Senha da Loja"
              type={mostrarSenha ? "text" : "password"}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              fullWidth
              variant="filled"
              InputProps={{
                style: { backgroundColor: "#2a2a2a", color: "white" },
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setMostrarSenha(!mostrarSenha)}
                      edge="end"
                      sx={{ color: "#bbb" }}
                    >
                      {mostrarSenha ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              InputLabelProps={{ style: { color: "#aaa" } }}
            />

            <Button
              type="submit"
              variant="contained"
              disabled={carregando}
              startIcon={<StoreIcon />}
              sx={{
                bgcolor: "#1976d2",
                "&:hover": { bgcolor: "#1565c0" },
              }}
            >
              {carregando ? (
                <>
                  <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
                  Criando...
                </>
              ) : (
                "Criar loja"
              )}
            </Button>
          </Box>
        </Paper>

        {/* Lista de lojas */}
        <Paper sx={{ p: 3, bgcolor: "#1e1e1e", color: "white" }}>
          <Typography variant="h6" mb={2}>
            Lojas Cadastradas
          </Typography>

          {lojas.length === 0 ? (
            <Typography color="gray" align="center">
              Nenhuma loja cadastrada.
            </Typography>
          ) : (
            <List>
              {lojas.map((loja) => (
                <Box key={loja.id}>
                  <ListItem
                    secondaryAction={
                      <Stack direction="row" spacing={1}>
                        <IconButton
                          color="warning"
                          onClick={() => navigate(`/loja/${loja.id}/painel`)}
                        >
                          <StoreIcon />
                        </IconButton>
                        <IconButton
                          color="error"
                          onClick={() => excluirLoja(loja.email)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Stack>
                    }
                  >
                    <ListItemText
                      primary={loja.nome}
                      secondary={loja.email}
                      secondaryTypographyProps={{
                        color: "gray",
                        fontSize: "0.8rem",
                      }}
                    />
                  </ListItem>
                  <Divider sx={{ bgcolor: "#333" }} />
                </Box>
              ))}
            </List>
          )}
        </Paper>
      </Container>
    </Box>
  );
}
