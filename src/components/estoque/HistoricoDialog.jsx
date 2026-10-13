// src/components/estoque/HistoricoDialog.jsx
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, Paper, Stack, Typography,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import TuneIcon from "@mui/icons-material/Tune";
import AddCircleIcon from "@mui/icons-material/AddCircle";
import { fmtBRL, fmtData } from "../../utils/estoqueUtils";

const TIPO_INFO = {
  entrada:  { label: "ENTRADA",  color: "#4caf50", icon: <ArrowDownwardIcon fontSize="small" />, sinal: "+" },
  saida:    { label: "SAÍDA",    color: "#f44336", icon: <ArrowUpwardIcon fontSize="small" />,   sinal: "-" },
  ajuste:   { label: "AJUSTE",   color: "#ff9800", icon: <TuneIcon fontSize="small" />,          sinal: "=" },
  criacao:  { label: "CRIAÇÃO",  color: "#2196f3", icon: <AddCircleIcon fontSize="small" />,     sinal: "+" },
};

export default function HistoricoDialog({ open, onClose, item }) {
  if (!item) return null;

  const historico = [...(item.historico || [])].sort((a, b) => {
    const da = a.data || "";
    const db = b.data || "";
    return db.localeCompare(da);
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ textTransform: "uppercase", fontWeight: "bold" }}>
        HISTÓRICO DE MOVIMENTAÇÕES
      </DialogTitle>
      <DialogContent>
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          <Typography variant="body2" color="#bbb">
            <strong>{item.nome}</strong>
            {item.codigo ? ` • ${item.codigo}` : ""}
          </Typography>
          <Typography variant="caption" color="#999">
            Estoque atual: <strong>{item.quantidadeAtual} {item.unidade}</strong>
            {item.quantidadeMinima > 0 && ` • mínimo: ${item.quantidadeMinima} ${item.unidade}`}
          </Typography>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        {historico.length === 0 ? (
          <Typography color="#888" align="center" sx={{ py: 3 }}>
            Nenhuma movimentação registrada ainda.
          </Typography>
        ) : (
          <Stack spacing={1}>
            {historico.map((h, i) => {
              const info = TIPO_INFO[h.tipo] || {
                label: h.tipo?.toUpperCase() || "?",
                color: "#888",
                icon: null,
                sinal: "",
              };
              return (
                <Paper key={i} sx={{ p: 1.5, bgcolor: "#252525", borderRadius: 1.5 }}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <Box sx={{ color: info.color, display: "flex", alignItems: "center" }}>
                      {info.icon}
                    </Box>
                    <Chip
                      label={info.label}
                      size="small"
                      sx={{ bgcolor: info.color, color: "#fff", fontWeight: "bold" }}
                    />
                    <Typography sx={{ color: "#fff", fontWeight: "bold", flex: 1 }}>
                      {info.sinal} {h.quantidade} {item.unidade}
                    </Typography>
                    <Typography variant="caption" color="#aaa">
                      {fmtData(h.data)}
                    </Typography>
                  </Stack>

                  <Stack direction="row" spacing={2} sx={{ mt: 0.5, pl: 4 }}>
                    {h.precoCompra > 0 && (
                      <Typography variant="caption" color="#bbb">
                        💰 {fmtBRL(h.precoCompra)}
                      </Typography>
                    )}
                    {h.motivo && (
                      <Typography variant="caption" color="#999" sx={{ flex: 1 }}>
                        📝 {h.motivo}
                      </Typography>
                    )}
                  </Stack>

                  {h.usuario && (
                    <Typography variant="caption" color="#666" sx={{ display: "block", pl: 4, mt: 0.25 }}>
                      👤 {h.usuario}
                    </Typography>
                  )}
                </Paper>
              );
            })}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>FECHAR</Button>
      </DialogActions>
    </Dialog>
  );
}