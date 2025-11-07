import React, { useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Calendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  MenuItem,
  TextField,
  Stack,
  Avatar,
} from "@mui/material";
import { format, addMonths, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import html2canvas from "html2canvas";
import ShareIcon from "@mui/icons-material/Share";
import PaletteIcon from "@mui/icons-material/Palette";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

const EscalaFolgas = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const funcionarios = location.state?.funcionarios || [];

  const [dataAtual, setDataAtual] = useState(new Date());
  const [folgas, setFolgas] = useState({});
  const [selectedFuncionario, setSelectedFuncionario] = useState("");
  const [colorModal, setColorModal] = useState(false);
  const [funcionarioCores, setFuncionarioCores] = useState({});
  const printRef = useRef();

  const formatDate = (date) => format(date, "yyyy-MM-dd");

  const handleDayClick = (value) => {
    if (!selectedFuncionario) return alert("Selecione um funcionário antes!");
    const dateKey = formatDate(value);
    const updated = { ...folgas };

    if (updated[dateKey] === selectedFuncionario) {
      delete updated[dateKey];
    } else {
      updated[dateKey] = selectedFuncionario;
    }
    setFolgas(updated);
  };

  const handleColorChange = (funcId, color) => {
    setFuncionarioCores({ ...funcionarioCores, [funcId]: color });
  };

  const gerarImagem = async () => {
    const canvas = await html2canvas(printRef.current);
    const dataUrl = canvas.toDataURL("image/png");
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], "escala.png", { type: "image/png" });

    const url = `https://api.whatsapp.com/send?text=Escala de folgas ${format(
      dataAtual,
      "MMMM yyyy",
      { locale: ptBR }
    )}`;
    window.open(url, "_blank");

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = "escala-folgas.png";
    a.click();
  };

  return (
    <Box sx={{ p: 3, bgcolor: "#121212", minHeight: "100vh", color: "white" }}>
      {/* 🔙 Botão Voltar */}
      <Button
        variant="outlined"
        color="inherit"
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 2 }}
        onClick={() => navigate(-1)}
      >
        Voltar ao Painel
      </Button>

      <Typography variant="h5" mb={2}>
        Escala de Folgas —{" "}
        {format(dataAtual, "MMMM yyyy", { locale: ptBR })
          .replace(/^\w/, (c) => c.toUpperCase())}
      </Typography>

      <Stack direction="row" spacing={2} mb={2}>
        <Button
          variant="outlined"
          color="info"
          onClick={() => setDataAtual(subMonths(dataAtual, 1))}
        >
          Mês Anterior
        </Button>
        <Button
          variant="outlined"
          color="info"
          onClick={() => setDataAtual(addMonths(dataAtual, 1))}
        >
          Próximo Mês
        </Button>
      </Stack>

      <TextField
        select
        label="Selecionar Funcionário"
        value={selectedFuncionario}
        onChange={(e) => setSelectedFuncionario(e.target.value)}
        fullWidth
        sx={{
          mb: 2,
          "& .MuiInputBase-root": {
            backgroundColor: "#1e1e1e",
            color: "white",
          },
          "& .MuiInputLabel-root": {
            color: "#bbb",
          },
          "& .MuiSvgIcon-root": {
            color: "white",
          },
        }}
      >
        {funcionarios.length > 0 ? (
          funcionarios.map((f) => (
            <MenuItem key={f.id} value={f.id}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Avatar
                  sx={{
                    width: 24,
                    height: 24,
                    bgcolor: funcionarioCores[f.id] || "#1976d2",
                  }}
                />
                <Typography>{f.nome}</Typography>
              </Stack>
            </MenuItem>
          ))
        ) : (
          <MenuItem disabled>Nenhum funcionário encontrado</MenuItem>
        )}
      </TextField>

      <Button
        variant="outlined"
        startIcon={<PaletteIcon />}
        onClick={() => setColorModal(true)}
        sx={{ mb: 2 }}
      >
        Cores dos Funcionários
      </Button>

      {/* 🗓️ CALENDÁRIO */}
      <Box
        ref={printRef}
        sx={{
          bgcolor: "#1e1e1e",
          p: 2,
          borderRadius: 2,
          border: "1px solid #333",
          color: "white",
          width: "fit-content",
        }}
      >
        <Calendar
          value={dataAtual}
          onClickDay={handleDayClick}
          activeStartDate={dataAtual}
          locale="pt-BR"
          tileContent={({ date }) => {
            const id = folgas[formatDate(date)];
            if (id) {
              const cor = funcionarioCores[id] || "#1976d2";
              return (
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    bgcolor: cor,
                    mx: "auto",
                    mt: 0.5,
                  }}
                />
              );
            }
            return null;
          }}
          className="custom-calendar"
        />

        {/* LEGENDA */}
        <Box mt={3}>
          <Typography variant="h6">Legenda</Typography>
          {funcionarios.map((f) => (
            <Stack
              key={f.id}
              direction="row"
              alignItems="center"
              spacing={1}
              mt={1}
            >
              <Box
                sx={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  bgcolor: funcionarioCores[f.id] || "#1976d2",
                }}
              />
              <Typography>{f.nome}</Typography>
            </Stack>
          ))}
        </Box>
      </Box>

      <Button
        variant="contained"
        color="success"
        onClick={gerarImagem}
        startIcon={<ShareIcon />}
        sx={{ mt: 3 }}
      >
        Gerar e Compartilhar Imagem
      </Button>

      {/* 🎨 MODAL DE CORES */}
      <Dialog open={colorModal} onClose={() => setColorModal(false)}>
        <DialogTitle>Editar Cores dos Funcionários</DialogTitle>
        <DialogContent>
          {funcionarios.map((f) => (
            <Stack
              key={f.id}
              direction="row"
              alignItems="center"
              spacing={2}
              mt={2}
            >
              <Typography sx={{ minWidth: 100 }}>{f.nome}</Typography>
              <input
                type="color"
                value={funcionarioCores[f.id] || "#1976d2"}
                onChange={(e) => handleColorChange(f.id, e.target.value)}
                style={{
                  width: 40,
                  height: 40,
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                }}
              />
            </Stack>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setColorModal(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      {/* 🌙 ESTILO CUSTOMIZADO DO CALENDÁRIO */}
      <style>{`
        .custom-calendar {
          background-color: #1e1e1e !important;
          color: white !important;
          border: none !important;
          border-radius: 10px;
          padding: 10px;
        }

        .react-calendar__tile {
          background: #2a2a2a !important;
          color: white !important;
          border-radius: 6px;
          margin: 2px;
        }

        .react-calendar__tile:hover {
          background: #333 !important;
        }

        .react-calendar__tile--now {
          background: #1976d2 !important;
          color: #fff !important;
        }

        .react-calendar__tile--active {
          background: #2196f3 !important;
          color: #fff !important;
        }

        .react-calendar__navigation button {
          color: white !important;
          background: none !important;
        }

        .react-calendar__month-view__weekdays {
          color: #bbb !important;
        }
      `}</style>
    </Box>
  );
};

export default EscalaFolgas;
