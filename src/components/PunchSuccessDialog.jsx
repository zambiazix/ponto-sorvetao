// src/components/PunchSuccessDialog.jsx
import { Dialog, Box, Typography, Avatar, Button, Stack } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { useEffect, useState } from "react";

export default function PunchSuccessDialog({ open, onClose, nome, tipo, hora, foto }) {
  const [countdown, setCountdown] = useState(4);

  useEffect(() => {
    if (!open) return;
    setCountdown(4);
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    const auto = setTimeout(onClose, 4000);
    return () => { clearInterval(t); clearTimeout(auto); };
  }, [open, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: "#0f2417",
          borderRadius: 4,
          border: "2px solid #4caf50",
          boxShadow: "0 0 40px rgba(76,175,80,0.5)",
          overflow: "hidden",
        },
      }}
    >
      <Box sx={{ p: 4, textAlign: "center", color: "white" }}>
        <Avatar
          src={foto || ""}
          sx={{
            width: 100, height: 100, mx: "auto", mb: 2,
            bgcolor: "#4caf50", fontSize: 48, border: "4px solid #fff",
          }}
        >
          {!foto && (nome ? nome.charAt(0).toUpperCase() : "✓")}
        </Avatar>
        <CheckCircleIcon sx={{ fontSize: 56, color: "#4caf50", mb: 1 }} />
        <Typography variant="h5" sx={{ fontWeight: "bold", mb: 0.5 }}>
          PONTO REGISTRADO!
        </Typography>
        <Typography variant="h6" sx={{ color: "#a5d6a7", mb: 2 }}>
          {nome}
        </Typography>
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          <Typography variant="body1">
            🕐 <strong>{hora}</strong>
          </Typography>
          <Typography variant="body2" sx={{ color: "#c8e6c9" }}>
            {tipo}
          </Typography>
        </Stack>
        <Button
          variant="contained"
          color="success"
          onClick={onClose}
          fullWidth
          sx={{ mt: 1 }}
        >
          OK ({countdown})
        </Button>
      </Box>
    </Dialog>
  );
}