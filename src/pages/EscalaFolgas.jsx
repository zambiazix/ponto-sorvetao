import React, { useState, useRef, useEffect } from "react";
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
  const [funcionarioCores, setFuncionarioCores] = useState(() => {
    try {
      const stored = localStorage.getItem("funcionarioCores");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [feriados, setFeriados] = useState(new Set());
  const [feriadoNomes, setFeriadoNomes] = useState({});
  const printRef = useRef();

  const formatDate = (date) => format(date, "yyyy-MM-dd");

  // Feriados fixos
  const feriadosFixosComNome = [
    { name: "Confraternização Universal", mmdd: "01-01" },
    { name: "Tiradentes", mmdd: "21-04" },
    { name: "Dia do Trabalho", mmdd: "01-05" },
    { name: "Independência do Brasil", mmdd: "07-09" },
    { name: "Nossa Senhora Aparecida", mmdd: "12-10" },
    { name: "Finados", mmdd: "02-11" },
    { name: "Proclamação da República", mmdd: "15-11" },
    { name: "Natal", mmdd: "25-12" },
    { name: "Consciência Negra", mmdd: "20-11" }, // adicionado por padrão
  ];

  const calculateEaster = (year) => {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const L = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * L) / 451);
    const month = Math.floor((h + L - 7 * m + 114) / 31);
    const day = ((h + L - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  };

  const addDays = (date, days) => {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  };

  const computeMovableHolidaysForYear = (year) => {
    const easter = calculateEaster(year);
    return [
      { name: "Páscoa", date: format(addDays(easter, 0), "yyyy-MM-dd") },
      { name: "Sexta-feira Santa", date: format(addDays(easter, -2), "yyyy-MM-dd") },
      { name: "Carnaval", date: format(addDays(easter, -47), "yyyy-MM-dd") },
      { name: "Corpus Christi", date: format(addDays(easter, 60), "yyyy-MM-dd") },
    ];
  };

  // Carregar feriados
  useEffect(() => {
    const year = dataAtual.getFullYear();
    const yearsToCompute = [year - 1, year, year + 1];
    const set = new Set();
    const nomes = {};

    yearsToCompute.forEach((y) => {
      feriadosFixosComNome.forEach((f) => {
        const [dia, mes] = f.mmdd.split("-");
        const key = `${y}-${mes}-${dia}`;
        set.add(key);
        nomes[key] = f.name;
      });

      const mov = computeMovableHolidaysForYear(y);
      mov.forEach((m) => {
        set.add(m.date);
        nomes[m.date] = m.name;
      });
    });

    const raw = localStorage.getItem("feriadosExtras");
    if (raw) {
      try {
        const custom = JSON.parse(raw);
        custom.forEach((d) => {
          if (typeof d !== "string") return;
          if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
            set.add(d);
            nomes[d] = "Feriado personalizado";
          } else if (/^\d{2}-\d{2}$/.test(d)) {
            yearsToCompute.forEach((y) => {
              const key = `${y}-${d}`;
              set.add(key);
              nomes[key] = "Feriado personalizado";
            });
          }
        });
      } catch {}
    }

    setFeriados(set);
    setFeriadoNomes(nomes);
  }, [dataAtual]);

  // Persistir cores
  useEffect(() => {
    localStorage.setItem("funcionarioCores", JSON.stringify(funcionarioCores));
  }, [funcionarioCores]);

  const handleDayClick = (value) => {
    if (!selectedFuncionario) return alert("Selecione um funcionário antes!");
    const dateKey = formatDate(value);
    const updated = { ...folgas };
    const arr = Array.isArray(updated[dateKey]) ? [...updated[dateKey]] : [];

    const idx = arr.indexOf(selectedFuncionario);
    if (idx >= 0) {
      arr.splice(idx, 1);
      if (arr.length === 0) delete updated[dateKey];
      else updated[dateKey] = arr;
    } else {
      arr.push(selectedFuncionario);
      updated[dateKey] = arr;
    }

    setFolgas(updated);
  };

  const handleColorChange = (funcId, color) => {
    setFuncionarioCores({ ...funcionarioCores, [funcId]: color });
  };

  const gerarImagem = async () => {
    try {
      const canvas = await html2canvas(printRef.current);
      const base64Image = canvas.toDataURL("image/png");
      const res = await fetch(base64Image);
      const blob = await res.blob();
      const file = new File([blob], "escala-folgas.png", { type: "image/png" });

      const titulo = `Escala de Folgas — ${format(dataAtual, "MMMM yyyy", {
        locale: ptBR,
      }).replace(/^\w/, (c) => c.toUpperCase())}`;

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: titulo,
          text: "Segue a escala 📅",
          files: [file],
        });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "escala-folgas.png";
        a.click();
        alert("📥 Imagem baixada.");
      }
    } catch {
      alert("Erro ao gerar imagem.");
    }
  };

  const renderDotsForDate = (date) => {
    const key = formatDate(date);
    const arr = Array.isArray(folgas[key]) ? folgas[key] : [];
    if (!arr.length) return null;

    const MAX_VISIBLE = 6;
    const visible = arr.slice(0, MAX_VISIBLE);
    const extra = arr.length - visible.length;

    return (
      <Box
        sx={{
          mt: "auto",
          mb: 0.5,
          display: "flex",
          gap: "4px",
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {visible.map((id) => (
          <Box
            key={id}
            title={funcionarios.find((f) => f.id === id)?.nome || id}
            sx={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: funcionarioCores[id] || "#1976d2",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
            }}
          />
        ))}
        {extra > 0 && (
          <Box
            sx={{
              minWidth: 18,
              height: 14,
              borderRadius: 8,
              bgcolor: "#333",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              px: 0.5,
            }}
            title={`${extra} outros`}
          >
            +{extra}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Box sx={{ p: 3, bgcolor: "#121212", minHeight: "100vh", color: "white" }}>
      <Button
        variant="outlined"
        color="inherit"
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 2 }}
        onClick={() => navigate(-1)}
      >
        Voltar ao Painel
      </Button>

      <Typography variant="h5" mb={2} sx={{ color: "white" }}>
        Escala de Folgas —{" "}
        {format(dataAtual, "MMMM yyyy", { locale: ptBR }).replace(/^\w/, (c) =>
          c.toUpperCase()
        )}
      </Typography>

      <Stack direction="row" spacing={2} mb={2}>
        <Button
          variant="outlined"
          color="inherit"
          onClick={() => setDataAtual(subMonths(dataAtual, 1))}
          sx={{ color: "white", borderColor: "white" }}
        >
          Mês Anterior
        </Button>
        <Button
          variant="outlined"
          color="inherit"
          onClick={() => setDataAtual(addMonths(dataAtual, 1))}
          sx={{ color: "white", borderColor: "white" }}
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
          "& .MuiInputBase-root": { backgroundColor: "#1e1e1e", color: "white" },
          "& .MuiInputLabel-root": { color: "#bbb" },
          "& .MuiSvgIcon-root": { color: "white" },
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

      {/* Calendário */}
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
          onActiveStartDateChange={({ activeStartDate }) =>
            setDataAtual(activeStartDate)
          }
          locale="pt-BR"
          tileContent={({ date }) => (
            <Box
              sx={{
                position: "absolute",
                bottom: 4,
                left: 0,
                right: 0,
                display: "flex",
                justifyContent: "center",
              }}
            >
              {renderDotsForDate(date)}
            </Box>
          )}
          tileClassName={({ date, view }) => {
            if (view === "month") {
              const dateKey = formatDate(date);
              const classes = [];
              const isHoliday = feriados.has(dateKey);
              const isOtherMonth = date.getMonth() !== dataAtual.getMonth();
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;

              if (isOtherMonth) classes.push("other-month");
              else if (isWeekend) classes.push("weekend-tile");
              if (isHoliday) classes.push("holiday-ring");

              return classes.join(" ");
            }
            return null;
          }}
          className="custom-calendar"
        />

        {/* Legenda */}
        <Box mt={3}>
          <Typography variant="h6">Legenda</Typography>
          {funcionarios.map((f) => (
            <Stack key={f.id} direction="row" alignItems="center" spacing={1} mt={1}>
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

          <Stack direction="row" alignItems="center" spacing={1} mt={1}>
            <Box
              sx={{
                width: 16,
                height: 16,
                borderRadius: "4px",
                border: "2px solid #d4af37",
              }}
            />
            <Typography>Feriado</Typography>
          </Stack>
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

      {/* Modal */}
      <Dialog open={colorModal} onClose={() => setColorModal(false)}>
        <DialogTitle>Editar Cores dos Funcionários</DialogTitle>
        <DialogContent>
          {funcionarios.map((f) => (
            <Stack key={f.id} direction="row" alignItems="center" spacing={2} mt={2}>
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

      <style>{`
        .custom-calendar {
          background-color: #1e1e1e !important;
          color: white !important;
          border: none !important;
          border-radius: 10px;
          padding: 10px;
        }
        .react-calendar__navigation button {
          color: white !important;
        }
        .react-calendar__tile {
          background: #2a2a2a !important;
          color: white !important;
          border-radius: 10px;
          margin: 2px;
          height: 72px;
          position: relative;
          overflow: hidden;
          transition: all 0.15s ease-in-out;
        }
        .react-calendar__tile:hover {
          background: #333 !important;
        }
        .other-month {
          background: #151515 !important;
          color: #666 !important;
        }
        .weekend-tile {
          background: #2b2b2b !important;
          color: #ffb74d !important;
          font-weight: 600 !important;
        }
        .holiday-ring::before {
          content: "";
          position: absolute;
          top: 2px;
          left: 2px;
          right: 2px;
          bottom: 2px;
          border: 2px solid #d4af37;
          border-radius: 10px;
          box-shadow: 0 0 8px rgba(212,175,55,0.5);
          pointer-events: none;
        }
      `}</style>
    </Box>
  );
};

export default EscalaFolgas;
