// src/components/EstoqueAlertBanner.jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Alert, AlertTitle, Box, Chip, Collapse, IconButton, Stack, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../services/firebase";

export default function EstoqueAlertBanner() {
  const navigate = useNavigate();
  const { lojaId } = useParams();
  const [alertas, setAlertas] = useState([]);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const col = collection(db, "lojas", lojaId, "estoque_itens");
        const snap = await getDocs(col);
        const lista = [];
        snap.docs.forEach((d) => {
          const it = { id: d.id, ...d.data() };
          const qtd = it.quantidadeAtual ?? it.quantidade ?? 0;
          const min = it.quantidadeMinima ?? 0;
          if (min > 0 && qtd <= min) lista.push({ ...it, quantidadeAtual: qtd, quantidadeMinima: min });
        });
        lista.sort((a, b) => (a.quantidadeAtual - a.quantidadeMinima) - (b.quantidadeAtual - b.quantidadeMinima));
        setAlertas(lista);
      } catch (e) { console.warn("Erro ao carregar alertas:", e); }
    })();
  }, [lojaId]);

  if (alertas.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Alert
        severity="warning"
        icon={<Inventory2Icon />}
        action={
          <IconButton size="small" onClick={() => setAberto((a) => !a)}>
            <ExpandMoreIcon sx={{ transform: aberto ? "rotate(180deg)" : "none", transition: "0.2s" }} />
          </IconButton>
        }
        sx={{
          bgcolor: "#332b12", color: "#ffb74d",
          border: "1px solid #ff9800", borderRadius: 2,
          "& .MuiAlert-icon": { color: "#ff9800" },
        }}
      >
        <AlertTitle sx={{ fontWeight: "bold", m: 0 }}>
          📦 {alertas.length} {alertas.length === 1 ? "item abaixo" : "itens abaixo"} do mínimo
        </AlertTitle>
        <Collapse in={aberto}>
          <Stack spacing={0.5} sx={{ mt: 1.5 }}>
            {alertas.map((it) => (
              <Stack
                key={it.id}
                direction="row"
                alignItems="center"
                spacing={1}
                onClick={() => navigate(`/loja/${lojaId}/estoque`)}
                sx={{ cursor: "pointer", "&:hover": { bgcolor: "rgba(255,152,0,0.08)" }, borderRadius: 1, p: 0.5 }}
              >
                <Typography variant="body2" sx={{ flex: 1, color: "#fff" }}>
                  {it.nome}
                </Typography>
                <Chip
                  size="small"
                  label={`${it.quantidadeAtual} / ${it.quantidadeMinima} ${it.unidade || "un"}`}
                  sx={{ bgcolor: "#ff9800", color: "#000", fontWeight: "bold" }}
                />
              </Stack>
            ))}
          </Stack>
        </Collapse>
      </Alert>
    </Box>
  );
}